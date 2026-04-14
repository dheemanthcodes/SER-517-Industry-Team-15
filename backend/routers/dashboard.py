from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

try:
    from ..config import supabase
    from ..services.dashboard import build_all_details_payload, build_snapshot
except ImportError:
    from config import supabase
    from services.dashboard import build_all_details_payload, build_snapshot


router = APIRouter(tags=["Dashboard"])


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
