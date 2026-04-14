from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import hashlib
import os
import secrets

from dotenv import load_dotenv
from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pi_service import get_bluetooth_data, get_paired_devices, pair_device, remove_device, scan_devices

import os
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client

from pi_service import (
    get_bluetooth_data,
    get_paired_devices,
    pair_device,
    remove_device,
    scan_devices,
)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv("supabase_url")
SUPABASE_KEY = os.getenv("supabase_service_role_key") or os.getenv("supabase_anonkey")
FRONTEND_URL = os.getenv(
    "frontend_url",
    "https://drug-box-base-station-smart-tracking.vercel.app",
)
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "frontend_origins",
        ",".join(
            [
                FRONTEND_URL,
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]
        ),
    ).split(",")
    if origin.strip()
]

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing Supabase credentials: set supabase_url and supabase_service_role_key")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


app = FastAPI(
    title="Pi Bluetooth API",
    description=(
        "API for Raspberry Pi integrations. "
        "Use these endpoints to receive JSON payloads from a Pi, connect over WebSocket, and manage Bluetooth devices."
    ),
    version="1.0.0",
    swagger_ui_parameters={"defaultModelsExpandDepth": -1},
    openapi_tags=[
        {"name": "General", "description": "Basic health and welcome routes."},
        {"name": "Pi Data", "description": "Receive JSON data sent from a Raspberry Pi."},
        {"name": "Bluetooth", "description": "Manage Bluetooth scanning, pairing, and removal through the Pi."},
{"name": "Dashboard", "description": "Dashboard and device management data endpoints."},
    ],
)

latest_pi_payload: Optional[Dict[str, Any]] = None

TRACKED_ASSET_STATES = {"IN_VEHICLE", "IN_USE", "MISSING"}
DEFAULT_MISSING_TIMEOUT_SECONDS = 90


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


def extract_device_key(payload: Dict[str, Any]) -> str:
    for key in ("device_id", "device_name", "pi_name", "pi_id"):
        candidate = str(payload.get(key) or "").strip()
        if candidate:
            return candidate
    return ""


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

    device_key = extract_device_key(payload)
    vehicle_id = str(payload.get("vehicle_id") or "").strip() or None
    device_row = None

    if device_key:
        for candidate in device_rows:
            if device_key in {
                str(candidate.get("device_name") or "").strip(),
                str(candidate.get("id") or "").strip(),
            }:
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
        .select("id, vehicle_id, label, type")
        .eq("vehicle_id", vehicle_id)
        .execute()
        .data
        or []
    )
    asset_ids = [asset.get("id") for asset in assets if asset.get("id")]

    tag_rows = []
    status_rows = []
    if asset_ids:
        tag_rows = (
            supabase.table("ble_tags")
            .select("asset_id, identifier")
            .in_("asset_id", asset_ids)
            .execute()
            .data
            or []
        )
        status_rows = (
            supabase.table("asset_status")
            .select("asset_id, vehicle_id, state, last_seen_at, last_rssi, updated_at")
            .in_("asset_id", asset_ids)
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
        "tag_by_asset_id": {
            tag.get("asset_id"): normalize_ble_identifier(tag.get("identifier"))
            for tag in tag_rows
            if tag.get("asset_id")
        },
        "status_by_asset_id": {
            row.get("asset_id"): row for row in status_rows if row.get("asset_id")
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


def upsert_asset_status_row(
    asset_id: str,
    vehicle_id: str,
    state: str,
    observed_at: Optional[datetime],
    rssi: Optional[float],
) -> None:
    supabase.table("asset_status").upsert(
        {
            "asset_id": asset_id,
            "vehicle_id": vehicle_id,
            "state": state,
            "last_seen_at": to_iso8601(observed_at),
            "last_rssi": rssi,
            "updated_at": to_iso8601(utc_now()),
        }
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
            "rssi": rssi,
            "observed_at": to_iso8601(observed_at),
            "received_at": to_iso8601(utc_now()),
        }
    ).execute()


def open_missing_alert(asset_id: str, vehicle_id: str, reason: str, opened_at: datetime) -> None:
    existing_open = (
        supabase.table("alerts")
        .select("id")
        .eq("asset_id", asset_id)
        .eq("vehicle_id", vehicle_id)
        .in_("status", ["OPEN", "ACK"])
        .limit(1)
        .execute()
        .data
        or []
    )

    if existing_open:
        return

    supabase.table("alerts").insert(
        {
            "asset_id": asset_id,
            "vehicle_id": vehicle_id,
            "status": "OPEN",
            "reason": reason,
            "opened_at": to_iso8601(opened_at),
        }
    ).execute()


def close_resolved_alerts(asset_id: str, vehicle_id: str, closed_at: datetime) -> None:
    open_alerts = (
        supabase.table("alerts")
        .select("id, status")
        .eq("asset_id", asset_id)
        .eq("vehicle_id", vehicle_id)
        .in_("status", ["OPEN", "ACK"])
        .execute()
        .data
        or []
    )

    for alert in open_alerts:
        alert_id = alert.get("id")
        if not alert_id:
            continue
        supabase.table("alerts").update(
            {
                "status": "CLOSED",
                "closed_at": to_iso8601(closed_at),
            }
        ).eq("id", alert_id).execute()


def sync_alert_for_asset(
    asset: Dict[str, Any],
    vehicle: Optional[Dict[str, Any]],
    vehicle_id: str,
    state: str,
    event_time: datetime,
) -> None:
    asset_id = asset.get("id")
    if not asset_id:
        return

    if state == "MISSING":
        asset_label = asset.get("label") or asset_id
        vehicle_label = (vehicle or {}).get("unit_number") or vehicle_id
        open_missing_alert(
            asset_id,
            vehicle_id,
            f"BLE disconnect detected: {asset_label} is missing from {vehicle_label}",
            event_time,
        )
        return

    if state in {"IN_VEHICLE", "IN_USE"}:
        close_resolved_alerts(asset_id, vehicle_id, event_time)


def process_pi_batch(payload: Dict[str, Any]) -> Dict[str, Any]:
    batch_time = extract_payload_observed_at(payload, utc_now())
    observations_by_identifier = normalize_observations(payload)
    context = load_tracking_context(payload)

    vehicle_id = (context.get("vehicle") or {}).get("id") or str(payload.get("vehicle_id") or "").strip()
    assets = context.get("assets") or []
    device = context.get("device") or {}

    if not vehicle_id or not assets:
        return {
            "device_id": device.get("id"),
            "device_name": device.get("device_name"),
            "vehicle_id": vehicle_id,
            "processed_assets": 0,
            "seen_assets": 0,
            "missing_assets": 0,
            "states": [],
        }

    tag_by_asset_id = context.get("tag_by_asset_id") or {}
    status_by_asset_id = context.get("status_by_asset_id") or {}
    missing_timeout_seconds = context.get("missing_timeout_seconds") or DEFAULT_MISSING_TIMEOUT_SECONDS

    state_rows = []
    seen_assets = 0
    missing_assets = 0

    for asset in assets:
        asset_id = asset.get("id")
        if not asset_id:
            continue

        ble_identifier = tag_by_asset_id.get(asset_id)
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

        should_insert_event = bool(observation) or previous_state != next_state
        if should_insert_event:
            insert_presence_event_row(
                asset_id=asset_id,
                vehicle_id=vehicle_id,
                device_id=device.get("id"),
                state=next_state,
                observed_at=event_time,
                rssi=rssi,
            )

        upsert_asset_status_row(
            asset_id=asset_id,
            vehicle_id=vehicle_id,
            state=next_state,
            observed_at=None if next_state == "MISSING" else last_seen_at,
            rssi=None if next_state == "MISSING" else rssi,
        )
        sync_alert_for_asset(asset, context.get("vehicle"), vehicle_id, next_state, event_time)

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
        "states": state_rows,
    }


ALLOWED_DEVICES = {
    "pi-001": "6gOIpiSJ_zlS_hskU8zkIDL0kvQta5zKzsERk98uKj0",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["General"], summary="Welcome route")
def read_root():
    return {"message": "Backend is running"}


@app.post(
    "/api/pi/data",
    tags=["Pi Data"],
    summary="Receive Raspberry Pi JSON data",
    description="Accepts any non-empty JSON object sent by a Raspberry Pi and stores the latest payload in memory.",
)
def receive_pi_data(
    payload: Dict[str, Any] = Body(
        ...,
        example={
            "device_id": "pi-01",
            "temperature": 24.6,
            "humidity": 55,
            "status": "online",
        },
    )
):
    global latest_pi_payload

    if not payload:
        raise HTTPException(status_code=400, detail="Request JSON body cannot be empty")

    processing_summary = process_pi_batch(payload)

    latest_pi_payload = {
        "payload": payload,
        "received_at": utc_now().isoformat(),
        "processing_summary": processing_summary,
    }
    return {
        "status": "success",
        "message": "Raspberry Pi data received successfully",
        "data": latest_pi_payload,
    }


@app.get(
    "/api/pi/data/latest",
    tags=["Pi Data"],
    summary="Get latest Raspberry Pi payload",
    description="Returns the most recent JSON payload received from a Raspberry Pi.",
)
def get_latest_pi_data():
    if latest_pi_payload is None:
        raise HTTPException(status_code=404, detail="No Raspberry Pi data has been received yet")
    return {"status": "success", "data": latest_pi_payload}


@app.websocket("/ws/device")
async def websocket_device(websocket: WebSocket):
    device_id = None

    try:
        await websocket.accept()

        hello = await websocket.receive_json()

        if hello.get("type") != "hello":
            await websocket.close(code=1008)
            return

        device_id = hello.get("device_id")
        token = hello.get("token")

        if not device_id or not token:
            await websocket.close(code=1008)
            return

        if ALLOWED_DEVICES.get(device_id) != token:
            await websocket.close(code=1008)
            return

        print(f"[CONNECTED] {device_id}")

        await websocket.send_json(
            {
                "type": "hello_ack",
                "device_id": device_id,
                "message": "Connected successfully",
            }
        )

        while True:
            message = await websocket.receive_json()
            print(f"[MESSAGE] {device_id}: {message}")

            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        print(f"[DISCONNECTED] {device_id}")
    except Exception as e:
        print(f"[ERROR] {device_id}: {e}")


@app.get("/api/bluetooth", tags=["Bluetooth"], summary="Get Bluetooth devices")
def fetch_bluetooth_info():
    try:
        data = get_bluetooth_data()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bluetooth/scan", tags=["Bluetooth"], summary="Scan for Bluetooth devices")
def api_scan_devices(seconds: int = 8):
    print(f"[DEBUG] Received scan request for {seconds} seconds")
    try:
        data = scan_devices(duration=seconds)
        print(f"[DEBUG] Scan successful: {data}")
        return {"status": "success", "data": data}
    except Exception as e:
        print(f"[ERROR] Scan failed with exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bluetooth/paired", tags=["Bluetooth"], summary="Get paired Bluetooth devices")
def api_paired_devices():
    try:
        data = get_paired_devices()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/bluetooth/pair", tags=["Bluetooth"], summary="Pair a Bluetooth device")
def api_pair_device(payload: dict):
    mac = payload.get("mac")
    if not mac:
        raise HTTPException(status_code=400, detail="Missing 'mac' in request body")
    try:
        result = pair_device(mac)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/bluetooth/remove", tags=["Bluetooth"], summary="Remove a Bluetooth device")
def api_remove_device(payload: dict):
    mac = payload.get("mac")
    if not mac:
        raise HTTPException(status_code=400, detail="Missing 'mac' in request body")
    try:
        result = remove_device(mac)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def build_snapshot():
    vehicles = supabase.table("vehicles").select("*").execute().data or []
    devices = supabase.table("devices").select("*").eq("is_active", True).execute().data or []
    assets = supabase.table("assets").select("*").execute().data or []
    ble_tags = supabase.table("ble_tags").select("*").execute().data or []

    vehicle_by_id = {v.get("id"): v for v in vehicles if v.get("id")}
    tag_by_asset = {t.get("asset_id"): t for t in ble_tags if t.get("asset_id")}
    assets_by_vehicle = {}

    for asset in assets:
        vehicle_id = asset.get("vehicle_id")
        if not vehicle_id:
            continue
        assets_by_vehicle.setdefault(vehicle_id, []).append(asset)

    ui_snapshot = {}

    for device in devices:
        device_name = (device.get("device_name") or "").strip()
        if not device_name:
            continue

        vehicle_id = device.get("vehicle_id")
        vehicle = vehicle_by_id.get(vehicle_id) if vehicle_id else None
        vehicle_assets = assets_by_vehicle.get(vehicle_id, []) if vehicle_id else []

        tracked_devices = []
        for asset in vehicle_assets:
            tag = tag_by_asset.get(asset.get("id"))
            if not tag:
                continue
            tracked_devices.append(
                {
                    "name": asset.get("label") or tag.get("asset_id"),
                    "address": tag.get("identifier"),
                }
            )

        ui_snapshot[device_name] = {
            "ambulanceId": vehicle.get("unit_number") if vehicle else None,
            "ipAddress": device.get("ip_address"),
            "devices": tracked_devices,
        }

    return ui_snapshot


@app.get("/api/fetchpidetails", tags=["Dashboard"], summary="Get full dashboard snapshot")
def get_dashboard():
    return build_snapshot()


@app.delete(
    "/api/deleteambulance/{vehicle_id}",
    tags=["Dashboard"],
    summary="Delete an ambulance without deleting its Pi or BLE records",
)
def delete_ambulance(vehicle_id: str):
    if not vehicle_id:
        raise HTTPException(status_code=400, detail="'vehicle_id' is required")

    try:
        result = supabase.rpc("delete_ambulance", {"p_vehicle_id": vehicle_id}).execute()
        rpc_data = result.data

        if isinstance(rpc_data, list):
            rpc_data = rpc_data[0] if rpc_data else None

        if not rpc_data:
            raise HTTPException(status_code=500, detail="Delete ambulance RPC returned no data")

        return {
            "status": "success",
            "message": "Ambulance deleted successfully",
            "data": rpc_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/updateambulance", tags=["Dashboard"], summary="Update an ambulance and its assets")
def update_ambulance(payload: dict):
    vehicle_id  = payload.get("vehicle_id")
    unit_number = (payload.get("unit_number") or "").strip()
    station_name = (payload.get("station_name") or "").strip()
    raspberry_pi_name = (payload.get("raspberry_pi_name") or "").strip()
    assets_payload = payload.get("assets", [])

    if not vehicle_id:
        raise HTTPException(status_code=400, detail="'vehicle_id' is required")
    if not unit_number:
        raise HTTPException(status_code=400, detail="'unit_number' is required")

    try:
        supabase.table("vehicles").update(
            {
                "unit_number": unit_number,
                "station_name": station_name,
            }
        ).eq("id", vehicle_id).execute()

        supabase.table("devices").update({"vehicle_id": None}).eq("vehicle_id", vehicle_id).execute()
        if raspberry_pi_name:
            supabase.table("devices").update({"vehicle_id": None}).eq(
                "device_name", raspberry_pi_name
            ).neq("vehicle_id", vehicle_id).execute()
            supabase.table("devices").update({"vehicle_id": vehicle_id}).eq(
                "device_name", raspberry_pi_name
            ).execute()

        normalized_assets = [
            {
                "id": a.get("id"),
                "type": (a.get("type") or "").strip(),
                "label": a.get("label"),
                "ble_identifier": (a.get("ble_identifier") or "").strip(),
            }
            for a in assets_payload
            if a.get("id")
        ]

        if normalized_assets:
            existing_tags = supabase.table("ble_tags").select("id, asset_id").in_(
                "asset_id", [asset["id"] for asset in normalized_assets]
            ).execute().data or []
            tag_by_asset_id = {
                tag.get("asset_id"): tag for tag in existing_tags if tag.get("asset_id")
            }

            for asset in normalized_assets:
                asset_id = asset["id"]
                asset_type = (asset["type"] or "").upper()
                supabase.table("assets").update(
                    {
                        "label": asset.get("label"),
                        "vehicle_id": vehicle_id,
                    }
                ).eq("id", asset_id).execute()

                tag_payload = {"identifier": asset["ble_identifier"], "asset_id": asset_id}
                existing_tag = tag_by_asset_id.get(asset_id)
                if existing_tag and existing_tag.get("id"):
                    supabase.table("ble_tags").update(tag_payload).eq(
                        "id", existing_tag["id"]
                    ).execute()
                else:
                    supabase.table("ble_tags").insert(tag_payload).execute()

        try:
            supabase.table("alerts").insert(
	    {
                "asset_id":   vehicle_id,
                "vehicle_id": vehicle_id,
                "status":     "OPEN",
                "reason":     f"Device updated: {unit_number}",
                "opened_at":  datetime.now(timezone.utc).isoformat(),
		}
	    ).execute()
        except Exception as alert_err:
            print(f"[WARN] Failed to log audit alert: {alert_err}")

        return {"status": "success", "message": "Ambulance updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dashboard/paired-devices", tags=["Dashboard"], summary="Get paired devices by Pi")
def get_paired_devices_map():
    snapshot = build_snapshot()
    result = {}
    for veh in snapshot["vehicles"]:
        pi = veh.get("pi_device")
        if not pi:
            continue
        devices = [
            {"name": asset["label"], "address": asset["ble_tag"]["identifier"]}
            for asset in veh["assets"]
            if asset["ble_tag"] is not None
        ]
        result[pi["id"]] = {
            "ambulanceId": veh["unit_number"],
            "ipAddress":   pi["ip_address"],
            "devices":     devices,
        }
    return result


class PiDetailsPayload(BaseModel):
    name: str
    ip_address: str

@app.post("/api/addpidetails", tags=["Pi Data"], summary="Add or update Raspberry Pi details")
def add_pi_details(payload: PiDetailsPayload):
    try:
        name = payload.name.strip()
        ip_address = payload.ip_address.strip()

        if not name or not ip_address:
            raise HTTPException(status_code=400, detail="name and ip_address are required")

        device_response = (
            supabase.table("devices")
            .select("id")
            .eq("device_name", name)
            .execute()
        )

        devices = device_response.data or []

        if devices:
            supabase.table("devices").update(
                {
                    "ip_address": ip_address,
                    "is_active": True,
                }
            ).eq("device_name", name).execute()

            return {
                "status": "success",
                "message": "Pi details updated successfully",
            }

        supabase.table("devices").insert(
            {
                "device_name": name,
                "ip_address": ip_address,
                "vehicle_id": None,
                "api_key_hash": hashlib.sha256(secrets.token_urlsafe(32).encode("utf-8")).hexdigest(),
                "is_active": True,
            }
        ).execute()

        return {"status": "success", "message": "Pi details added successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/deletepi/{pi_name}", tags=["Pi Data"], summary="Delete a Raspberry Pi")
def delete_pi(pi_name: str):
    if not pi_name or not pi_name.strip():
        raise HTTPException(status_code=400, detail="'pi_name' is required")

    normalized_name = pi_name.strip()

    try:
        result = supabase.rpc("delete_pi_device", {"p_device_name": normalized_name}).execute()
        rpc_data = result.data

        if isinstance(rpc_data, list):
            rpc_data = rpc_data[0] if rpc_data else None

        if not rpc_data:
            raise HTTPException(status_code=500, detail="Pi delete RPC returned no data")

        return {
            "status": "success",
            "message": "Raspberry Pi deleted successfully",
            "data": rpc_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def build_device_management_payload():
    vehicles = supabase.table("vehicles").select("*").execute().data or []
    devices = supabase.table("devices").select("*").eq("is_active", True).execute().data or []
    assets = supabase.table("assets").select("*").execute().data or []
    ble_tags = supabase.table("ble_tags").select("*").execute().data or []

    device_by_vehicle = {d.get("vehicle_id"): d for d in devices if d.get("vehicle_id")}
    ble_by_asset = {t.get("asset_id"): t for t in ble_tags if t.get("asset_id")}

    vehicles_out = []
    for veh in vehicles:
        vid = veh.get("id")
        if not vid:
            continue

        pi_device = device_by_vehicle.get(vid)
        vehicle_assets = [a for a in assets if a.get("vehicle_id") == vid]

        boxes = []
        pouches = []

        for asset in vehicle_assets:
            asset_type = (asset.get("type") or "").upper()
            tag = ble_by_asset.get(asset.get("id"))

            payload = {
                "asset_id": asset.get("id"),
                "label": asset.get("label"),
                "ble_mac_address": tag.get("identifier") if tag else None,
                "parent_asset_id": asset.get("parent_asset_id"),
            }

            if asset_type == "BOX":
                boxes.append(payload)
            elif asset_type == "POUCH":
                pouches.append(payload)

        vehicles_out.append(
            {
                "vehicle_id": vid,
                "ambulance_number": veh.get("unit_number"),
                "station": veh.get("station_name"),
                "raspberry_pi": {
                    "id": pi_device.get("id"),
                    "name": pi_device.get("device_name"),
                    "ip_address": pi_device.get("ip_address"),
                    "is_active": pi_device.get("is_active"),
                }
                if pi_device
                else None,
                "boxes": boxes,
                "pouches": pouches,
            }
        )

    return {"vehicles": vehicles_out}


def build_all_details_payload():
    vehicles = supabase.table("vehicles").select("*").execute().data or []
    devices = supabase.table("devices").select("*").eq("is_active", True).execute().data or []
    assets = supabase.table("assets").select("*").execute().data or []
    ble_tags = supabase.table("ble_tags").select("*").execute().data or []

    device_by_vehicle_id = {
        device.get("vehicle_id"): device for device in devices if device.get("vehicle_id")
    }
    ble_tag_by_asset_id = {
        ble_tag.get("asset_id"): ble_tag for ble_tag in ble_tags if ble_tag.get("asset_id")
    }
    assets_by_vehicle_id = {}

    for asset in assets:
        vehicle_id = asset.get("vehicle_id")
        if not vehicle_id:
            continue
        assets_by_vehicle_id.setdefault(vehicle_id, []).append(asset)

    rows = []
    for vehicle in vehicles:
        vehicle_id = vehicle.get("id")
        if not vehicle_id:
            continue

        device = device_by_vehicle_id.get(vehicle_id)
        vehicle_assets = assets_by_vehicle_id.get(vehicle_id, [])

        if not vehicle_assets:
            rows.append(
                {
                    "vehicle_id": vehicle.get("id"),
                    "unit_number": vehicle.get("unit_number"),
                    "station_name": vehicle.get("station_name"),
                    "device_name": device.get("device_name") if device else None,
                    "ip_address": device.get("ip_address") if device else None,
                    "asset_id": None,
                    "asset_type": None,
                    "label": None,
                    "parent_asset_id": None,
                    "ble_identifier": None,
                    "tag_model": None,
                }
            )
            continue

        for asset in vehicle_assets:
            asset_id = asset.get("id")
            ble_tag = ble_tag_by_asset_id.get(asset_id)

            rows.append(
                {
                    "vehicle_id": vehicle.get("id"),
                    "unit_number": vehicle.get("unit_number"),
                    "station_name": vehicle.get("station_name"),
                    "device_name": device.get("device_name") if device else None,
                    "ip_address": device.get("ip_address") if device else None,
                    "asset_id": asset_id,
                    "asset_type": asset.get("type"),
                    "label": asset.get("label"),
                    "parent_asset_id": asset.get("parent_asset_id"),
                    "ble_identifier": ble_tag.get("identifier") if ble_tag else None,
                    "tag_model": ble_tag.get("tag_model") if ble_tag else None,
                }
            )

    return rows


@app.get(
    "/api/fetchalldetails",
    tags=["Dashboard"],
    summary="Get flat vehicle, device, asset, and BLE tag details",
)
def get_all_details():
    try:
        data = build_all_details_payload()
        return {
            "status": "success",
            "source": "supabase",
            "data": data,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch all details: {str(e)}",
        )


@app.get("/api/dashboard/paired-devices", tags=["Dashboard"], summary="Get paired devices by Pi")
def get_paired_devices_map():
    snapshot = build_snapshot()
    result = {}

    for device_name, data in snapshot.items():
        result[device_name] = {
            "ambulanceId": data.get("ambulanceId"),
            "ipAddress": data.get("ipAddress"),
            "devices": data.get("devices", []),
        }

    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
