from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException

try:
    from ..config import supabase
    from ..services.dashboard import build_all_details_payload, build_snapshot
except ImportError:
    from config import supabase
    from services.dashboard import build_all_details_payload, build_snapshot


router = APIRouter(tags=["Dashboard"])


def _normalize_ble_identifier(value: str) -> str:
    return str(value or "").strip().replace("-", ":").upper()


def _load_pi(device_name: str):
    if not device_name:
        return None

    rows = (
        supabase.table("devices")
        .select("id, vehicle_id")
        .eq("device_name", device_name)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _load_pi_ble_identifiers(device_id: str):
    if not device_id:
        return set()

    rows = (
        supabase.table("ble_tags")
        .select("identifier")
        .eq("asset_id", device_id)
        .execute()
        .data
        or []
    )
    return {
        _normalize_ble_identifier(row.get("identifier"))
        for row in rows
        if _normalize_ble_identifier(row.get("identifier"))
    }


def _validate_assigned_ble_identifiers(normalized_assets, raspberry_pi_name: str):
    if not raspberry_pi_name:
        return None, set()

    selected_pi = _load_pi(raspberry_pi_name)
    if not selected_pi:
        raise HTTPException(status_code=404, detail="Selected Raspberry Pi was not found")
    if selected_pi.get("vehicle_id"):
        raise HTTPException(status_code=409, detail="Selected Raspberry Pi is already assigned")

    available_identifiers = _load_pi_ble_identifiers(selected_pi.get("id"))
    requested_identifiers = [asset["ble_identifier"] for asset in normalized_assets]

    if len(set(requested_identifiers)) != len(requested_identifiers):
        raise HTTPException(status_code=400, detail="BLE identifiers must be unique within an ambulance")

    missing_identifiers = [
        identifier for identifier in requested_identifiers if identifier not in available_identifiers
    ]
    if missing_identifiers:
        raise HTTPException(
            status_code=400,
            detail="All BLE identifiers must belong to the selected Raspberry Pi",
        )

    return selected_pi, available_identifiers


def _pair_assets_with_parent_ids(normalized_assets):
    boxes = [asset for asset in normalized_assets if asset["type"] == "BOX"]
    pouches = [asset for asset in normalized_assets if asset["type"] == "POUCH"]

    if len(boxes) not in {1, 2}:
        raise HTTPException(status_code=400, detail="Ambulances must have 1 or 2 boxes")
    if len(pouches) != len(boxes):
        raise HTTPException(status_code=400, detail="Each box must have exactly one pouch")

    for box in boxes:
        box["parent_asset_id"] = None

    for index, pouch in enumerate(pouches):
        pouch["parent_asset_id"] = boxes[index].get("id")

    return boxes + pouches


def _build_asset_rows_for_create(vehicle_id: str, normalized_assets):
    ordered_assets = _pair_assets_with_parent_ids(normalized_assets)
    box_rows = []
    pouch_rows = []

    for asset in ordered_assets:
        asset_row = {
            "id": str(uuid4()),
            "vehicle_id": vehicle_id,
            "type": asset["type"],
            "label": asset["label"],
            "ble_identifier": asset["ble_identifier"],
            "parent_asset_id": None,
            "is_active": True,
        }

        if asset["type"] == "BOX":
            box_rows.append(asset_row)
        else:
            pouch_rows.append(asset_row)

    for index, pouch_row in enumerate(pouch_rows):
        pouch_row["parent_asset_id"] = box_rows[index]["id"]

    return box_rows + pouch_rows


def _ensure_unique_unit_number(unit_number: str, exclude_vehicle_id: str | None = None):
    query = (
        supabase.table("vehicles")
        .select("id")
        .eq("unit_number", unit_number)
        .limit(1)
    )

    if exclude_vehicle_id:
        query = query.neq("id", exclude_vehicle_id)

    existing_vehicle = query.execute().data or []
    if existing_vehicle:
        raise HTTPException(status_code=409, detail="An ambulance with this unit number already exists")


def _load_active_vehicle_assets(vehicle_id: str):
    if not vehicle_id:
        return []

    return (
        supabase.table("assets")
        .select("id, type")
        .eq("vehicle_id", vehicle_id)
        .neq("is_active", False)
        .execute()
        .data
        or []
    )


def _upsert_asset_status_rows(asset_rows):
    now_iso = datetime.now(timezone.utc).isoformat()
    status_rows = [
        {
            "asset_id": asset["id"],
            "vehicle_id": asset["vehicle_id"],
            "state": "IN_VEHICLE",
            "last_seen_at": now_iso,
            "last_rssi": None,
            "updated_at": now_iso,
        }
        for asset in asset_rows
        if asset.get("id") and asset.get("vehicle_id")
    ]

    if status_rows:
        supabase.table("asset_status").upsert(status_rows).execute()


def _build_alert_status_update(status: str):
    normalized_status = str(status or "").strip().upper()
    now_iso = datetime.now(timezone.utc).isoformat()

    if normalized_status == "OPEN":
        return {
            "status": "OPEN",
            "acknowledged_at": None,
            "closed_at": None,
        }

    if normalized_status in {"ACK", "IN_PROGRESS", "IN-PROGRESS"}:
        return {
            "status": "ACK",
            "acknowledged_at": now_iso,
            "closed_at": None,
        }

    if normalized_status in {"CLOSED", "RESOLVED"}:
        return {
            "status": "CLOSED",
            "acknowledged_at": now_iso,
            "closed_at": now_iso,
        }

    raise HTTPException(status_code=400, detail="Status must be OPEN, IN_PROGRESS, or RESOLVED")


def _sync_vehicle_assets(vehicle_id: str, normalized_assets):
    current_assets_by_id = {
        asset["id"]: asset
        for asset in _load_active_vehicle_assets(vehicle_id)
        if asset.get("id")
    }
    ordered_assets = _pair_assets_with_parent_ids(normalized_assets)
    boxes = [asset for asset in ordered_assets if asset["type"] == "BOX"]
    pouches = [asset for asset in ordered_assets if asset["type"] == "POUCH"]
    box_asset_ids = []
    kept_asset_ids = set()
    persisted_asset_rows = []

    for box in boxes:
        existing_asset = current_assets_by_id.get(box.get("id"))
        asset_id = existing_asset["id"] if existing_asset else str(uuid4())

        asset_row = {
            "id": asset_id,
            "vehicle_id": vehicle_id,
            "type": "BOX",
            "label": box["label"],
            "ble_identifier": box["ble_identifier"],
            "parent_asset_id": None,
            "is_active": True,
        }

        if existing_asset:
            supabase.table("assets").update(
                {
                    "vehicle_id": asset_row["vehicle_id"],
                    "label": asset_row["label"],
                    "ble_identifier": asset_row["ble_identifier"],
                    "parent_asset_id": None,
                    "is_active": True,
                }
            ).eq("id", asset_id).execute()
        else:
            supabase.table("assets").insert(asset_row).execute()

        box_asset_ids.append(asset_id)
        kept_asset_ids.add(asset_id)
        persisted_asset_rows.append({"id": asset_id, "vehicle_id": vehicle_id})

    for index, pouch in enumerate(pouches):
        existing_asset = current_assets_by_id.get(pouch.get("id"))
        asset_id = existing_asset["id"] if existing_asset else str(uuid4())

        asset_row = {
            "id": asset_id,
            "vehicle_id": vehicle_id,
            "type": "POUCH",
            "label": pouch["label"],
            "ble_identifier": pouch["ble_identifier"],
            "parent_asset_id": box_asset_ids[index],
            "is_active": True,
        }

        if existing_asset:
            supabase.table("assets").update(
                {
                    "vehicle_id": asset_row["vehicle_id"],
                    "label": asset_row["label"],
                    "ble_identifier": asset_row["ble_identifier"],
                    "parent_asset_id": asset_row["parent_asset_id"],
                    "is_active": True,
                }
            ).eq("id", asset_id).execute()
        else:
            supabase.table("assets").insert(asset_row).execute()

        kept_asset_ids.add(asset_id)
        persisted_asset_rows.append({"id": asset_id, "vehicle_id": vehicle_id})

    retired_asset_ids = [
        asset_id for asset_id in current_assets_by_id if asset_id not in kept_asset_ids
    ]
    for asset_id in retired_asset_ids:
        supabase.table("assets").update(
            {
                "vehicle_id": None,
                "parent_asset_id": None,
                "is_active": False,
            }
        ).eq("id", asset_id).execute()

    return persisted_asset_rows


@router.get("/api/fetchpidetails", summary="Get full dashboard snapshot")
def get_dashboard():
    return build_snapshot()


@router.patch("/api/alerts/{alert_id}/status", summary="Update alert status")
def update_alert_status(alert_id: str, payload: dict):
    if not alert_id:
        raise HTTPException(status_code=400, detail="'alert_id' is required")

    update_payload = _build_alert_status_update(payload.get("status"))

    try:
        existing_rows = (
            supabase.table("alerts")
            .select("id, status")
            .eq("id", alert_id)
            .limit(1)
            .execute()
            .data
            or []
        )

        if not existing_rows:
            raise HTTPException(status_code=404, detail="Alert was not found")

        current_status = str(existing_rows[0].get("status") or "").upper()
        if current_status == "CLOSED" and update_payload["status"] != "CLOSED":
            raise HTTPException(
                status_code=409,
                detail="Resolved alerts cannot be moved back to another status.",
            )

        (
            supabase.table("alerts")
            .update(update_payload)
            .eq("id", alert_id)
            .execute()
        )
        rows = (
            supabase.table("alerts")
            .select("*")
            .eq("id", alert_id)
            .limit(1)
            .execute()
            .data
            or []
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Alert was not found")

        saved_status = str(rows[0].get("status") or "").upper()
        expected_status = update_payload["status"]
        if saved_status != expected_status:
            raise HTTPException(
                status_code=409,
                detail=f"Alert status did not update. Expected {expected_status}, found {saved_status or 'EMPTY'}.",
            )

        return {
            "status": "success",
            "data": rows[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete(
    "/api/deleteambulance/{vehicle_id}",
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


@router.post("/api/registerambulance", summary="Create an ambulance and assign a Raspberry Pi")
def register_ambulance(payload: dict):
    unit_number = (payload.get("unit_number") or "").strip()
    station_name = (payload.get("station_name") or "").strip()
    raspberry_pi_name = (payload.get("raspberry_pi_name") or "").strip()
    assets_payload = payload.get("assets", [])

    if not unit_number:
        raise HTTPException(status_code=400, detail="'unit_number' is required")
    if not station_name:
        raise HTTPException(status_code=400, detail="'station_name' is required")
    if not raspberry_pi_name:
        raise HTTPException(status_code=400, detail="'raspberry_pi_name' is required")

    normalized_assets = [
        {
            "type": (asset.get("type") or "").strip().upper(),
            "label": (asset.get("label") or "").strip(),
            "ble_identifier": _normalize_ble_identifier(asset.get("ble_identifier") or ""),
        }
        for asset in assets_payload
    ]

    if any(not asset["label"] for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="All asset labels are required")
    if any(not asset["ble_identifier"] for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="All BLE identifiers are required")

    if any(asset["type"] not in {"BOX", "POUCH"} for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="Asset types must be BOX or POUCH")

    try:
        _ensure_unique_unit_number(unit_number)
        selected_pi, _ = _validate_assigned_ble_identifiers(normalized_assets, raspberry_pi_name)

        vehicle_id = str(uuid4())
        asset_rows = _build_asset_rows_for_create(vehicle_id, normalized_assets)

        vehicle_insert = (
            supabase.table("vehicles")
            .insert(
                {
                    "id": vehicle_id,
                    "unit_number": unit_number,
                    "station_name": station_name,
                }
            )
            .execute()
        )
        if getattr(vehicle_insert, "error", None):
            raise HTTPException(status_code=500, detail=str(vehicle_insert.error))

        assets_insert = supabase.table("assets").insert(asset_rows).execute()
        if getattr(assets_insert, "error", None):
            raise HTTPException(status_code=500, detail=str(assets_insert.error))

        _upsert_asset_status_rows(asset_rows)

        device_update = (
            supabase.table("devices")
            .update({"vehicle_id": vehicle_id})
            .eq("device_name", raspberry_pi_name)
            .execute()
        )
        if getattr(device_update, "error", None):
            raise HTTPException(status_code=500, detail=str(device_update.error))

        try:
            supabase.table("alerts").insert(
                {
                    "asset_id": vehicle_id,
                    "vehicle_id": vehicle_id,
                    "status": "OPEN",
                    "reason": f"Device added: {unit_number}",
                    "opened_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as alert_err:
            print(f"[WARN] Failed to log audit alert: {alert_err}")

        return {
            "status": "success",
            "message": "Ambulance created successfully",
            "data": {
                "id": vehicle_id,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/updateambulance", summary="Update an ambulance and its assets")
def update_ambulance(payload: dict):
    vehicle_id = payload.get("vehicle_id")
    unit_number = (payload.get("unit_number") or "").strip()
    station_name = (payload.get("station_name") or "").strip()
    raspberry_pi_name = (payload.get("raspberry_pi_name") or "").strip()
    assets_payload = payload.get("assets", [])

    if not vehicle_id:
        raise HTTPException(status_code=400, detail="'vehicle_id' is required")
    if not unit_number:
        raise HTTPException(status_code=400, detail="'unit_number' is required")
    if not station_name:
        raise HTTPException(status_code=400, detail="'station_name' is required")

    normalized_assets = [
        {
            "id": a.get("id"),
            "type": (a.get("type") or "").strip().upper(),
            "label": (a.get("label") or "").strip(),
            "ble_identifier": _normalize_ble_identifier(a.get("ble_identifier") or ""),
            "parent_asset_id": a.get("parent_asset_id"),
        }
        for a in assets_payload
        if a.get("id")
    ]

    if any(not asset["label"] for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="All asset labels are required")
    if any(not asset["ble_identifier"] for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="All BLE identifiers are required")
    if any(asset["type"] not in {"BOX", "POUCH"} for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="Asset types must be BOX or POUCH")

    normalized_assets = _pair_assets_with_parent_ids(normalized_assets)

    try:
        _ensure_unique_unit_number(unit_number, exclude_vehicle_id=vehicle_id)
        supabase.table("vehicles").update(
            {
                "unit_number": unit_number,
                "station_name": station_name,
            }
        ).eq("id", vehicle_id).execute()

        if raspberry_pi_name:
            selected_pi = _load_pi(raspberry_pi_name)
            if not selected_pi:
                raise HTTPException(status_code=404, detail="Selected Raspberry Pi was not found")
            if selected_pi.get("vehicle_id") and selected_pi.get("vehicle_id") != vehicle_id:
                raise HTTPException(status_code=409, detail="Selected Raspberry Pi is already assigned")

            available_identifiers = _load_pi_ble_identifiers(selected_pi.get("id"))
            requested_identifiers = [asset["ble_identifier"] for asset in normalized_assets]
            if len(set(requested_identifiers)) != len(requested_identifiers):
                raise HTTPException(status_code=400, detail="BLE identifiers must be unique within an ambulance")
            if any(identifier not in available_identifiers for identifier in requested_identifiers):
                raise HTTPException(
                    status_code=400,
                    detail="All BLE identifiers must belong to the selected Raspberry Pi",
                )
        else:
            selected_pi = None

        supabase.table("devices").update({"vehicle_id": None}).eq("vehicle_id", vehicle_id).execute()
        if raspberry_pi_name:
            supabase.table("devices").update({"vehicle_id": None}).eq(
                "device_name", raspberry_pi_name
            ).neq("vehicle_id", vehicle_id).execute()
            supabase.table("devices").update({"vehicle_id": vehicle_id}).eq(
                "device_name", raspberry_pi_name
            ).execute()

        if normalized_assets:
            persisted_asset_rows = _sync_vehicle_assets(vehicle_id, normalized_assets)
            _upsert_asset_status_rows(persisted_asset_rows)

        try:
            supabase.table("alerts").insert(
                {
                    "asset_id": vehicle_id,
                    "vehicle_id": vehicle_id,
                    "status": "OPEN",
                    "reason": f"Device updated: {unit_number}",
                    "opened_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as alert_err:
            print(f"[WARN] Failed to log audit alert: {alert_err}")

        return {"status": "success", "message": "Ambulance updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/api/fetchalldetails",
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


@router.get("/api/dashboard/paired-devices", summary="Get paired devices by Pi")
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
