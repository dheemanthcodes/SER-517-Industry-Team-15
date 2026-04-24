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


class PiHeartbeatPayload(BaseModel):
    pi_id: Optional[str] = None
    pi_name: Optional[str] = None
    ip_address: Optional[str] = None
    scanner_status: Optional[str] = "starting"
    observed_at: Optional[str] = None


class BleTagUpsertPayload(BaseModel):
    name: str
    identifier: str
    pi_name: Optional[str] = None
    pi_id: Optional[str] = None
    ble_tag_id: Optional[str] = None


def _normalize_ble_identifier(value: str) -> str:
    return str(value or "").strip().replace("-", ":").upper()


def _is_valid_mac_address(value: str) -> bool:
    import re

    normalized = _normalize_ble_identifier(value)
    return bool(re.fullmatch(r"([0-9A-F]{2}:){5}[0-9A-F]{2}", normalized))


def _load_pi_by_identity(pi_id: str = "", pi_name: str = ""):
    device_query = supabase.table("devices").select(
        "id, device_name, ip_address, vehicle_id, is_active"
    ).limit(1)

    if pi_id:
        device_query = device_query.eq("id", pi_id)
    elif pi_name:
        device_query = device_query.eq("device_name", pi_name)
    else:
        return None

    devices = device_query.execute().data or []
    return devices[0] if devices else None


def _load_ble_mappings_for_pi(device_id: str):
    if not device_id:
        return []

    rows = (
        supabase.table("ble_tags")
        .select("id, identifier, tag_model")
        .eq("asset_id", device_id)
        .execute()
        .data
        or []
    )

    return [
        {
            "ble_tag_id": row.get("id"),
            "name": row.get("tag_model") or row.get("identifier") or "Unnamed BLE Device",
            "mac_address": _normalize_ble_identifier(row.get("identifier")),
        }
        for row in rows
        if _normalize_ble_identifier(row.get("identifier"))
    ]


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


@router.post("/api/pi/heartbeat", summary="Receive Raspberry Pi heartbeat and return BLE mappings")
def receive_pi_heartbeat(payload: PiHeartbeatPayload):
    normalized_pi_id = (payload.pi_id or "").strip()
    normalized_pi_name = (payload.pi_name or "").strip()
    normalized_ip_address = (payload.ip_address or "").strip()

    if not normalized_pi_id and not normalized_pi_name:
        raise HTTPException(status_code=400, detail="'pi_id' or 'pi_name' is required")

    try:
        device = _load_pi_by_identity(normalized_pi_id, normalized_pi_name)
        if not device:
            raise HTTPException(status_code=404, detail="Raspberry Pi was not found")

        updates = {"is_active": True}
        if normalized_ip_address:
            updates["ip_address"] = normalized_ip_address

        supabase.table("devices").update(updates).eq("id", device["id"]).execute()

        refreshed_device = _load_pi_by_identity(device.get("id"), "")
        ble_mappings = _load_ble_mappings_for_pi(device.get("id"))

        return {
            "status": "success",
            "message": "Heartbeat received",
            "data": {
                "heartbeat_received_at": utc_now().isoformat(),
                "scanner_status": payload.scanner_status or "starting",
                "pi": {
                    "id": (refreshed_device or device).get("id"),
                    "name": (refreshed_device or device).get("device_name"),
                    "ip_address": (refreshed_device or device).get("ip_address"),
                    "vehicle_id": (refreshed_device or device).get("vehicle_id"),
                    "is_active": (refreshed_device or device).get("is_active"),
                },
                "ble_mappings": ble_mappings,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        device_rows = (
            supabase.table("devices")
            .select("id, device_name, vehicle_id")
            .eq("device_name", normalized_name)
            .limit(1)
            .execute()
            .data
            or []
        )
        device = device_rows[0] if device_rows else None
        if not device:
            raise HTTPException(status_code=404, detail="Raspberry Pi was not found")

        device_id = device.get("id")
        deleted_ble_tags = []
        if device_id:
            deleted_ble_tags = (
                supabase.table("ble_tags")
                .select("id")
                .eq("asset_id", device_id)
                .execute()
                .data
                or []
            )
            if deleted_ble_tags:
                supabase.table("ble_tags").delete().eq("asset_id", device_id).execute()

        result = supabase.rpc("delete_pi_device", {"p_device_name": normalized_name}).execute()
        rpc_data = result.data

        if isinstance(rpc_data, list):
            rpc_data = rpc_data[0] if rpc_data else None

        if not rpc_data:
            raise HTTPException(status_code=500, detail="Pi delete RPC returned no data")

        return {
            "status": "success",
            "message": "Raspberry Pi deleted successfully",
            "data": {
                **(rpc_data or {}),
                "deleted_ble_tag_count": len(deleted_ble_tags),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/ble-tags", summary="Upsert a BLE tag by name + MAC")
def upsert_ble_tag(payload: BleTagUpsertPayload):
    name = (payload.name or "").strip()
    identifier = _normalize_ble_identifier(payload.identifier)
    pi_name = (payload.pi_name or "").strip()
    pi_id = (payload.pi_id or "").strip()
    ble_tag_id = (payload.ble_tag_id or "").strip()

    if not name:
        raise HTTPException(status_code=400, detail="'name' is required")

    if not identifier:
        raise HTTPException(status_code=400, detail="'identifier' is required")

    if not _is_valid_mac_address(identifier):
        raise HTTPException(status_code=400, detail="Identifier must be a valid MAC address")

    try:
        if not pi_id and not pi_name:
            raise HTTPException(status_code=400, detail="'pi_id' or 'pi_name' is required")

        device_query = supabase.table("devices").select("id, device_name, vehicle_id").limit(1)
        if pi_id:
            device_query = device_query.eq("id", pi_id)
        else:
            device_query = device_query.eq("device_name", pi_name)

        devices = device_query.execute().data or []
        device = devices[0] if devices else None
        if not device:
            raise HTTPException(status_code=404, detail="Selected Raspberry Pi was not found")

        existing_tag = None

        if ble_tag_id:
            existing = (
                supabase.table("ble_tags")
                .select("id, asset_id, identifier, tag_model")
                .eq("id", ble_tag_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            existing_tag = existing[0] if existing else None
            if not existing_tag:
                raise HTTPException(status_code=404, detail="BLE tag record was not found")
            if existing_tag.get("asset_id") != device.get("id"):
                raise HTTPException(
                    status_code=400,
                    detail="BLE tag record does not belong to the selected Raspberry Pi",
                )

        conflicting = (
            supabase.table("ble_tags")
            .select("id, asset_id, identifier")
            .eq("identifier", identifier)
            .execute()
            .data
            or []
        )
        if any(
            row.get("id") != ble_tag_id and row.get("asset_id") != device.get("id")
            for row in conflicting
            if row.get("asset_id")
        ):
            raise HTTPException(
                status_code=409,
                detail="This MAC address is already assigned to another asset.",
            )

        if not existing_tag:
            existing = (
                supabase.table("ble_tags")
                .select("id, asset_id, identifier, tag_model")
                .eq("asset_id", device.get("id"))
                .eq("tag_model", name)
                .limit(1)
                .execute()
                .data
                or []
            )
            existing_tag = existing[0] if existing else None

        if existing_tag:
            supabase.table("ble_tags").update(
                {
                    "identifier": identifier,
                    "tag_model": name,
                }
            ).eq("id", existing_tag["id"]).execute()
        else:
            inserted = (
                supabase.table("ble_tags").insert(
                    {
                        "asset_id": device.get("id"),
                        "identifier": identifier,
                        "tag_model": name,
                    }
                ).execute().data
                or []
            )
            existing_tag = inserted[0] if inserted else None

        return {
            "status": "success",
            "data": {
                "asset_id": device.get("id"),
                "device_id": device.get("id"),
                "ble_tag_id": existing_tag.get("id") if existing_tag else None,
                "pi_name": device.get("device_name"),
                "vehicle_id": device.get("vehicle_id"),
                "name": name,
                "identifier": identifier,
                "tag_model": name,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/ble-tags/{ble_tag_id}", summary="Delete a BLE tag")
def delete_ble_tag(ble_tag_id: str, pi_id: str | None = None, pi_name: str | None = None):
    normalized_ble_tag_id = (ble_tag_id or "").strip()
    normalized_pi_id = (pi_id or "").strip()
    normalized_pi_name = (pi_name or "").strip()

    if not normalized_ble_tag_id:
        raise HTTPException(status_code=400, detail="'ble_tag_id' is required")

    try:
        existing = (
            supabase.table("ble_tags")
            .select("id, asset_id, identifier, tag_model")
            .eq("id", normalized_ble_tag_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        ble_tag = existing[0] if existing else None
        if not ble_tag:
            raise HTTPException(status_code=404, detail="BLE tag record was not found")

        if normalized_pi_id or normalized_pi_name:
            device_query = supabase.table("devices").select("id, device_name, vehicle_id").limit(1)
            if normalized_pi_id:
                device_query = device_query.eq("id", normalized_pi_id)
            else:
                device_query = device_query.eq("device_name", normalized_pi_name)

            devices = device_query.execute().data or []
            device = devices[0] if devices else None
            if not device:
                raise HTTPException(status_code=404, detail="Selected Raspberry Pi was not found")
            if ble_tag.get("asset_id") != device.get("id"):
                raise HTTPException(
                    status_code=400,
                    detail="BLE tag record does not belong to the selected Raspberry Pi",
                )

        supabase.table("ble_tags").delete().eq("id", normalized_ble_tag_id).execute()

        remaining_rows = (
            supabase.table("ble_tags")
            .select("id")
            .eq("id", normalized_ble_tag_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if remaining_rows:
            raise HTTPException(
                status_code=403,
                detail=(
                    "BLE tag delete was blocked or affected no rows. "
                    "Check Supabase RLS delete policies or backend credentials."
                ),
            )

        return {
            "status": "success",
            "data": {
                "ble_tag_id": normalized_ble_tag_id,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
