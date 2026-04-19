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


class BleTagUpsertPayload(BaseModel):
    name: str
    identifier: str


def _normalize_ble_identifier(value: str) -> str:
    return str(value or "").strip().replace("-", ":").upper()


def _is_valid_mac_address(value: str) -> bool:
    import re

    normalized = _normalize_ble_identifier(value)
    return bool(re.fullmatch(r"([0-9A-F]{2}:){5}[0-9A-F]{2}", normalized))


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


@router.post("/api/ble-tags", summary="Upsert a BLE tag by name + MAC")
def upsert_ble_tag(payload: BleTagUpsertPayload):
    name = (payload.name or "").strip()
    identifier = _normalize_ble_identifier(payload.identifier)

    if not name:
        raise HTTPException(status_code=400, detail="'name' is required")

    if not identifier:
        raise HTTPException(status_code=400, detail="'identifier' is required")

    if not _is_valid_mac_address(identifier):
        raise HTTPException(status_code=400, detail="Identifier must be a valid MAC address")

    try:
        # ble_tags.asset_id is intended to reference assets.id. To align with the schema,
        # we create (or reuse) an asset row keyed by its label.
        assets = supabase.table("assets").select("id, vehicle_id, type, label").eq("label", name).execute().data or []
        asset = next(
            (
                row
                for row in assets
                if row.get("vehicle_id") is None and str(row.get("type") or "").upper() == "BOX"
            ),
            None,
        )

        if not asset:
            inserted = (
                supabase.table("assets")
                .insert(
                    {
                        "vehicle_id": None,
                        "type": "BOX",
                        "label": name,
                        "parent_asset_id": None,
                        "is_active": True,
                    }
                )
                .execute()
                .data
                or []
            )
            asset = inserted[0] if inserted else None

        if not asset or not asset.get("id"):
            raise HTTPException(status_code=500, detail="Failed to create asset record for BLE tag")

        asset_id = asset["id"]

        conflicting = (
            supabase.table("ble_tags")
            .select("asset_id, identifier")
            .eq("identifier", identifier)
            .execute()
            .data
            or []
        )
        if any(row.get("asset_id") != asset_id for row in conflicting if row.get("asset_id")):
            raise HTTPException(
                status_code=409,
                detail="This MAC address is already assigned to another asset.",
            )

        existing = (
            supabase.table("ble_tags")
            .select("id, asset_id, identifier")
            .eq("asset_id", asset_id)
            .execute()
            .data
            or []
        )

        if existing:
            supabase.table("ble_tags").update({"identifier": identifier}).eq("asset_id", asset_id).execute()
        else:
            supabase.table("ble_tags").insert({"asset_id": asset_id, "identifier": identifier}).execute()

        return {
            "status": "success",
            "data": {
                "asset_id": asset_id,
                "name": name,
                "identifier": identifier,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
