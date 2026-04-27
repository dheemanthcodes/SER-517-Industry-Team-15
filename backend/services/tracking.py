from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

try:
    from ..config import supabase
except ImportError:
    from config import supabase


TRACKED_ASSET_STATES = {"IN_VEHICLE", "IN_USE", "MISSING"}
DEFAULT_MISSING_TIMEOUT_SECONDS = 30


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_ble_identifier(value: Any) -> str:
    return str(value or "").strip().replace("-", ":").upper()


def parse_observed_at(value: Any, fallback: datetime) -> datetime:
    if value in (None, ""):
        return fallback

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return fallback

    text = str(value).strip()
    if not text:
        return fallback

    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"

    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return fallback

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def to_iso8601(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def safe_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def safe_int(value: Any) -> Optional[int]:
    numeric_value = safe_float(value)
    if numeric_value is None:
        return None

    return int(round(numeric_value))


def extract_device_keys(payload: Dict[str, Any]) -> List[str]:
    keys: List[str] = []

    for key in ("device_id", "device_name", "pi_name", "pi_id"):
        candidate = str(payload.get(key) or "").strip()
        if candidate and candidate not in keys:
            keys.append(candidate)

    return keys


def extract_payload_observed_at(payload: Dict[str, Any], fallback: datetime) -> datetime:
    for key in ("observed_at", "timestamp", "collected_at", "received_at", "sent_at"):
        if payload.get(key):
            return parse_observed_at(payload.get(key), fallback)
    return fallback


def extract_observation_list(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    observations: List[Dict[str, Any]] = []

    for key in ("detections", "observations", "ble_devices", "devices", "assets", "tags", "records"):
        value = payload.get(key)
        if isinstance(value, list):
            observations.extend([item for item in value if isinstance(item, dict)])

    if not observations and isinstance(payload.get("data"), list):
        observations.extend([item for item in payload.get("data", []) if isinstance(item, dict)])

    single_keys = ("identifier", "mac_address", "mac", "address", "ble_id", "ble_identifier")
    if not observations and any(payload.get(key) for key in single_keys):
        observations.append(payload)

    return observations


def extract_tracked_identifiers(payload: Dict[str, Any]) -> set[str]:
    tracked_identifiers = set()

    raw_values = payload.get("tracked_mac_addresses")
    if isinstance(raw_values, list):
        for value in raw_values:
            normalized = normalize_ble_identifier(value)
            if normalized:
                tracked_identifiers.add(normalized)

    return tracked_identifiers


def normalize_observations(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    fallback_time = extract_payload_observed_at(payload, utc_now())
    normalized: Dict[str, Dict[str, Any]] = {}

    for observation in extract_observation_list(payload):
        identifier = ""
        for key in ("identifier", "mac_address", "mac", "address", "ble_id", "ble_identifier"):
            identifier = normalize_ble_identifier(observation.get(key))
            if identifier:
                break

        if not identifier:
            continue

        explicit_state = str(
            observation.get("state")
            or observation.get("asset_state")
            or observation.get("status")
            or ""
        ).strip().upper()
        if explicit_state not in TRACKED_ASSET_STATES:
            explicit_state = None

        normalized[identifier] = {
            "identifier": identifier,
            "rssi": safe_float(
                observation.get("rssi")
                or observation.get("signal_strength")
                or observation.get("signal")
            ),
            "observed_at": parse_observed_at(
                observation.get("observed_at")
                or observation.get("timestamp")
                or observation.get("seen_at"),
                fallback_time,
            ),
            "state": explicit_state,
        }

    return normalized


def load_tracking_context(payload: Dict[str, Any]) -> Dict[str, Any]:
    device_rows = (
        supabase.table("devices")
        .select("id, device_name, vehicle_id, is_active")
        .eq("is_active", True)
        .execute()
        .data
        or []
    )

    device_keys = extract_device_keys(payload)
    vehicle_id = str(payload.get("vehicle_id") or "").strip() or None
    device_row = None

    if device_keys:
        for candidate in device_rows:
            candidate_keys = {
                str(candidate.get("device_name") or "").strip(),
                str(candidate.get("id") or "").strip(),
            }
            if any(device_key in candidate_keys for device_key in device_keys):
                device_row = candidate
                break

    if not vehicle_id and device_row:
        vehicle_id = device_row.get("vehicle_id")

    if not vehicle_id:
        return {
            "device": device_row,
            "vehicle": None,
            "assets": [],
            "tag_by_asset_id": {},
            "status_by_asset_id": {},
            "missing_timeout_seconds": DEFAULT_MISSING_TIMEOUT_SECONDS,
        }

    vehicle_response = (
        supabase.table("vehicles")
        .select("id, unit_number")
        .eq("id", vehicle_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    vehicle_row = vehicle_response[0] if vehicle_response else None

    assets = (
        supabase.table("assets")
        .select("id, vehicle_id, label, type, ble_identifier")
        .eq("vehicle_id", vehicle_id)
        .execute()
        .data
        or []
    )
    asset_ids = [asset.get("id") for asset in assets if asset.get("id")]

    status_rows = []
    active_alert_rows = []
    if asset_ids:
        status_rows = (
            supabase.table("asset_status")
            .select("asset_id, vehicle_id, state, last_seen_at, last_rssi, updated_at")
            .in_("asset_id", asset_ids)
            .execute()
            .data
            or []
        )
        active_alert_rows = (
            supabase.table("alerts")
            .select("id, asset_id, status")
            .in_("asset_id", asset_ids)
            .in_("status", ["OPEN", "ACK"])
            .execute()
            .data
            or []
        )

    config_response = (
        supabase.table("presence_config")
        .select("vehicle_id, missing_timeout_seconds")
        .eq("vehicle_id", vehicle_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    config_row = config_response[0] if config_response else None

    return {
        "device": device_row,
        "vehicle": vehicle_row,
        "assets": assets,
        "status_by_asset_id": {
            row.get("asset_id"): row for row in status_rows if row.get("asset_id")
        },
        "active_alert_by_asset_id": {
            row.get("asset_id"): row for row in active_alert_rows if row.get("asset_id")
        },
        "missing_timeout_seconds": int(
            (config_row or {}).get("missing_timeout_seconds")
            or DEFAULT_MISSING_TIMEOUT_SECONDS
        ),
    }


def determine_next_state(
    observation: Optional[Dict[str, Any]],
    previous_status: Optional[Dict[str, Any]],
    batch_time: datetime,
    missing_timeout_seconds: int,
) -> str:
    if observation:
        return observation.get("state") or "IN_VEHICLE"

    if previous_status:
        last_seen_at = parse_observed_at(previous_status.get("last_seen_at"), batch_time)
        if batch_time - last_seen_at < timedelta(seconds=max(missing_timeout_seconds, 0)):
            previous_state = str(previous_status.get("state") or "IN_VEHICLE").upper()
            if previous_state in TRACKED_ASSET_STATES:
                return previous_state

    return "MISSING"


def seed_asset_status_rows(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return

    supabase.table("asset_status").upsert(
        rows
    ).execute()


def insert_presence_event_row(
    asset_id: str,
    vehicle_id: str,
    device_id: Optional[str],
    state: str,
    observed_at: datetime,
    rssi: Optional[float],
) -> None:
    supabase.table("presence_events").insert(
        {
            "asset_id": asset_id,
            "vehicle_id": vehicle_id,
            "device_id": device_id,
            "state": state,
            "rssi": safe_int(rssi),
            "observed_at": to_iso8601(observed_at),
            "received_at": to_iso8601(utc_now()),
        }
    ).execute()


def keep_active_alert_open(active_alert: Optional[Dict[str, Any]]) -> None:
    if not active_alert or not active_alert.get("id"):
        return

    supabase.table("alerts").update(
        {
            "status": active_alert.get("status") or "OPEN",
            "closed_at": None,
        }
    ).eq("id", active_alert.get("id")).execute()


def process_pi_batch(payload: Dict[str, Any]) -> Dict[str, Any]:
    batch_time = extract_payload_observed_at(payload, utc_now())
    observations_by_identifier = normalize_observations(payload)
    tracked_identifiers = extract_tracked_identifiers(payload)
    context = load_tracking_context(payload)

    vehicle_id = (context.get("vehicle") or {}).get("id") or str(payload.get("vehicle_id") or "").strip()
    all_assets = context.get("assets") or []
    device = context.get("device") or {}
    assets = all_assets

    if tracked_identifiers:
        assets = [
            asset
            for asset in all_assets
            if normalize_ble_identifier(asset.get("ble_identifier")) in tracked_identifiers
        ]

    unmatched_asset_identifiers = sorted(
        {
            normalize_ble_identifier(asset.get("ble_identifier"))
            for asset in all_assets
            if normalize_ble_identifier(asset.get("ble_identifier"))
            and normalize_ble_identifier(asset.get("ble_identifier")) not in tracked_identifiers
        }
    ) if tracked_identifiers else []

    if not vehicle_id or not assets:
        return {
            "device_id": device.get("id"),
            "device_name": device.get("device_name"),
            "vehicle_id": vehicle_id,
            "processed_assets": 0,
            "seen_assets": 0,
            "missing_assets": 0,
            "tracked_identifiers": sorted(tracked_identifiers),
            "unmatched_asset_identifiers": unmatched_asset_identifiers,
            "states": [],
        }

    status_by_asset_id = context.get("status_by_asset_id") or {}
    active_alert_by_asset_id = context.get("active_alert_by_asset_id") or {}
    missing_timeout_seconds = context.get("missing_timeout_seconds") or DEFAULT_MISSING_TIMEOUT_SECONDS
    seeded_status_rows = []

    for asset in assets:
        asset_id = asset.get("id")
        if not asset_id or status_by_asset_id.get(asset_id):
            continue

        seeded_status_rows.append(
            {
                "asset_id": asset_id,
                "vehicle_id": vehicle_id,
                "state": "IN_VEHICLE",
                "last_seen_at": to_iso8601(batch_time),
                "last_rssi": None,
                "updated_at": to_iso8601(batch_time),
            }
        )
        status_by_asset_id[asset_id] = {
            "asset_id": asset_id,
            "vehicle_id": vehicle_id,
            "state": "IN_VEHICLE",
            "last_seen_at": to_iso8601(batch_time),
            "last_rssi": None,
            "updated_at": to_iso8601(batch_time),
        }

    seed_asset_status_rows(seeded_status_rows)

    state_rows = []
    seen_assets = 0
    missing_assets = 0

    for asset in assets:
        asset_id = asset.get("id")
        if not asset_id:
            continue

        ble_identifier = normalize_ble_identifier(asset.get("ble_identifier"))
        if not ble_identifier:
            continue

        observation = observations_by_identifier.get(ble_identifier) if ble_identifier else None
        previous_status = status_by_asset_id.get(asset_id)
        next_state = determine_next_state(
            observation,
            previous_status,
            batch_time,
            missing_timeout_seconds,
        )

        previous_state = str((previous_status or {}).get("state") or "").upper()
        event_time = observation.get("observed_at") if observation else batch_time
        rssi = observation.get("rssi") if observation else safe_float((previous_status or {}).get("last_rssi"))
        last_seen_at = observation.get("observed_at") if observation else parse_observed_at(
            (previous_status or {}).get("last_seen_at"),
            batch_time,
        )

        if observation:
            seen_assets += 1
        if next_state == "MISSING":
            missing_assets += 1

        active_alert = active_alert_by_asset_id.get(asset_id)
        has_active_alert = bool(active_alert)
        is_duplicate_missing_alert_event = next_state == "MISSING" and has_active_alert
        should_insert_event = (
            (bool(observation) or previous_state != next_state)
            and not is_duplicate_missing_alert_event
        )
        if should_insert_event:
            insert_presence_event_row(
                asset_id=asset_id,
                vehicle_id=vehicle_id,
                device_id=device.get("id"),
                state=next_state,
                observed_at=event_time,
                rssi=rssi,
            )
            if has_active_alert and next_state != "MISSING":
                keep_active_alert_open(active_alert)

        state_rows.append(
            {
                "asset_id": asset_id,
                "asset_label": asset.get("label"),
                "asset_type": asset.get("type"),
                "ble_identifier": ble_identifier,
                "state": next_state,
                "rssi": rssi,
                "last_seen_at": to_iso8601(None if next_state == "MISSING" else last_seen_at),
            }
        )

    return {
        "device_id": device.get("id"),
        "device_name": device.get("device_name"),
        "vehicle_id": vehicle_id,
        "vehicle_label": (context.get("vehicle") or {}).get("unit_number"),
        "processed_assets": len(state_rows),
        "seen_assets": seen_assets,
        "missing_assets": missing_assets,
        "tracked_identifiers": sorted(tracked_identifiers),
        "unmatched_asset_identifiers": unmatched_asset_identifiers,
        "states": state_rows,
    }
