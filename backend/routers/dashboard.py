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


@router.get("/api/fetchpidetails", summary="Get full dashboard snapshot")
def get_dashboard():
    return build_snapshot()


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
    station_name = (payload.get("station_name") or "").strip() or "Main Station"
    raspberry_pi_name = (payload.get("raspberry_pi_name") or "").strip()
    assets_payload = payload.get("assets", [])

    if not unit_number:
        raise HTTPException(status_code=400, detail="'unit_number' is required")
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

    if len(normalized_assets) != 4:
        raise HTTPException(status_code=400, detail="Exactly four assets are required")

    if any(not asset["label"] for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="All asset labels are required")
    if any(not asset["ble_identifier"] for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="All BLE identifiers are required")

    if any(asset["type"] not in {"BOX", "POUCH"} for asset in normalized_assets):
        raise HTTPException(status_code=400, detail="Asset types must be BOX or POUCH")

    try:
        existing_vehicle = (
            supabase.table("vehicles")
            .select("id")
            .eq("unit_number", unit_number)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing_vehicle:
            raise HTTPException(status_code=409, detail="An ambulance with this unit number already exists")

        selected_pi, _ = _validate_assigned_ble_identifiers(normalized_assets, raspberry_pi_name)

        vehicle_id = str(uuid4())
        asset_rows = [
            {
                "id": str(uuid4()),
                "vehicle_id": vehicle_id,
                "type": asset["type"],
                "label": asset["label"],
                "ble_identifier": asset["ble_identifier"],
                "is_active": True,
            }
            for asset in normalized_assets
        ]

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

    normalized_assets = [
        {
            "id": a.get("id"),
            "type": (a.get("type") or "").strip().upper(),
            "label": (a.get("label") or "").strip(),
            "ble_identifier": _normalize_ble_identifier(a.get("ble_identifier") or ""),
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

    try:
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
            for asset in normalized_assets:
                asset_id = asset["id"]
                supabase.table("assets").update(
                    {
                        "label": asset.get("label"),
                        "vehicle_id": vehicle_id,
                        "ble_identifier": asset["ble_identifier"],
                    }
                ).eq("id", asset_id).execute()
            _upsert_asset_status_rows(
                [
                    {
                        "id": asset["id"],
                        "vehicle_id": vehicle_id,
                    }
                    for asset in normalized_assets
                ]
            )

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
