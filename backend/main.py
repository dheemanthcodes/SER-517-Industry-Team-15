from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pi_service import get_bluetooth_data, get_paired_devices, pair_device, remove_device, scan_devices

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv("supabase_url")
SUPABASE_KEY = os.getenv("supabase_anonkey")

print("URL:", SUPABASE_URL)
print("KEY:", SUPABASE_KEY)

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
    ],
)

latest_pi_payload: Optional[Dict[str, Any]] = None


ALLOWED_DEVICES = {
    "pi-001": "6gOIpiSJ_zlS_hskU8zkIDL0kvQta5zKzsERk98uKj0",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

    latest_pi_payload = {
        "payload": payload,
        "received_at": datetime.now(timezone.utc).isoformat(),
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
    vehicles  = supabase.table("vehicles").select("*").execute().data
    devices   = supabase.table("devices").select("*").execute().data
    assets    = supabase.table("assets").select("*").execute().data
    ble_tags  = supabase.table("ble_tags").select("*").execute().data
    statuses  = supabase.table("asset_status").select("*").execute().data
    alerts    = supabase.table("alerts").select("*").execute().data

    tag_by_asset    = {t["asset_id"]: t for t in ble_tags}
    status_by_asset = {s["asset_id"]: s for s in statuses}
    device_by_veh   = {d["vehicle_id"]: d for d in devices}
    alerts_by_veh   = {}
    for a in alerts:
        alerts_by_veh.setdefault(a["vehicle_id"], []).append(a)

    ui_snapshot = {}

    for veh in vehicles:
        vid = veh["id"]
        pi = device_by_veh.get(vid)

        assets_out = []
        for ast in assets:
            if ast["vehicle_id"] != vid:
                continue

            tag = tag_by_asset.get(ast["id"])
            status = status_by_asset.get(ast["id"])

            assets_out.append({
                "id": ast["id"],
                "type": ast["type"],
                "label": ast["label"],
                "parent_asset_id": ast["parent_asset_id"],
                "ble_tag": {
                    "identifier": tag["identifier"],
                    "tag_model": tag["tag_model"],
                    "asset_id": tag["asset_id"],
                } if tag else None,
                "status": {
                    "state": status["state"],
                    "last_seen_at": status["last_seen_at"],
                    "last_rssi": status["last_rssi"],
                } if status else None,
            })

        vehicle_snapshot = {
            "id": veh["id"],
            "unit_number": veh["unit_number"],
            "station_name": veh["station_name"],
            "pi_device": {
                "id": pi["id"],
                "device_name": pi["device_name"],
                "ip_address": pi["ip_address"],
                "is_active": pi["is_active"],
            } if pi else None,
            "assets": assets_out,
            "alerts": alerts_by_veh.get(vid, []),
        }

        if not pi:
            continue

        ui_snapshot[pi["device_name"]] = {
            "ambulanceId": vehicle_snapshot["unit_number"],
            "ipAddress": vehicle_snapshot["pi_device"]["ip_address"],
            "devices": [
                {
                    "name": asset["ble_tag"]["asset_id"],
                    "address": asset["ble_tag"]["identifier"],
                }
                for asset in vehicle_snapshot["assets"]
                if asset["ble_tag"]
            ],
        }

    return ui_snapshot


@app.get("/api/fetchpidetails", tags=["Dashboard"], summary="Get full dashboard snapshot")
def get_dashboard():
    return build_snapshot()


@app.post("/api/updateambulance", tags=["Dashboard"], summary="Update an ambulance and its assets")
def update_ambulance(payload: dict):
    vehicle_id  = payload.get("vehicle_id")
    unit_number = (payload.get("unit_number") or "").strip()
    station_name = (payload.get("station_name") or "").strip()
    assets = payload.get("assets", [])

    if not vehicle_id:
        raise HTTPException(status_code=400, detail="'vehicle_id' is required")
    if not unit_number:
        raise HTTPException(status_code=400, detail="'unit_number' is required")

    try:
        rpc_payload = {
            "p_vehicle_id":  vehicle_id,
            "p_unit_number": unit_number,
            "p_station_name": station_name,
            "p_assets": [
                {
                    "id":             a.get("id"),
                    "type":           a.get("type"),
                    "label":          a.get("label"),
                    "ble_identifier": (a.get("ble_identifier") or "").strip(),
                    "parent_asset_id": a.get("parent_asset_id"),
                }
                for a in assets
            ],
        }

        result = supabase.rpc("update_ambulance", rpc_payload).execute()

        try:
            supabase.table("alerts").insert({
                "asset_id":   vehicle_id,
                "vehicle_id": vehicle_id,
                "status":     "OPEN",
                "reason":     f"Device updated: {unit_number}",
                "opened_at":  datetime.now(timezone.utc).isoformat(),
            }).execute()
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)