import hashlib
import secrets
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

try:
    from ..config import supabase
    from ..services.tracking import process_pi_batch, utc_now
except ImportError:
    from config import supabase
    from services.tracking import process_pi_batch, utc_now


router = APIRouter(tags=["Pi Data"])

latest_pi_payload: Optional[Dict[str, Any]] = None


class PiDetailsPayload(BaseModel):
    name: str
    ip_address: str


@router.post(
    "/api/pi/data",
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


@router.get(
    "/api/pi/data/latest",
    summary="Get latest Raspberry Pi payload",
    description="Returns the most recent JSON payload received from a Raspberry Pi.",
)
def get_latest_pi_data():
    if latest_pi_payload is None:
        raise HTTPException(status_code=404, detail="No Raspberry Pi data has been received yet")
    return {"status": "success", "data": latest_pi_payload}


@router.post("/api/addpidetails", summary="Add or update Raspberry Pi details")
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


@router.delete("/api/deletepi/{pi_name}", summary="Delete a Raspberry Pi")
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
