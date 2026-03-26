from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pi_service import get_bluetooth_data, get_paired_devices, pair_device, remove_device, scan_devices

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

MOCK_VEHICLES = [
    {"id": "veh-001", "unit_number": "AMB-001", "station_name": "Station Alpha"},
    {"id": "veh-002", "unit_number": "AMB-002", "station_name": "Station Bravo"},
]

MOCK_DEVICES = [
    {"id": "pi-1", "vehicle_id": "veh-001", "device_name": "Pi AMB-001", "ip_address": "192.168.1.101", "is_active": True},
    {"id": "pi-2", "vehicle_id": "veh-002", "device_name": "Pi AMB-002", "ip_address": "192.168.1.102", "is_active": True},
]

MOCK_ASSETS = [
    {"id": "ast-001", "vehicle_id": "veh-001", "type": "BOX",   "label": "Drug Box A", "parent_asset_id": None},
    {"id": "ast-002", "vehicle_id": "veh-001", "type": "POUCH", "label": "Device A",   "parent_asset_id": "ast-001"},
    {"id": "ast-003", "vehicle_id": "veh-001", "type": "POUCH", "label": "Device B",   "parent_asset_id": "ast-001"},
    {"id": "ast-004", "vehicle_id": "veh-001", "type": "POUCH", "label": "Device C",   "parent_asset_id": "ast-001"},
    {"id": "ast-005", "vehicle_id": "veh-001", "type": "POUCH", "label": "Device D",   "parent_asset_id": "ast-001"},
    {"id": "ast-006", "vehicle_id": "veh-002", "type": "BOX",   "label": "Drug Box B", "parent_asset_id": None},
    {"id": "ast-007", "vehicle_id": "veh-002", "type": "POUCH", "label": "Device E",   "parent_asset_id": "ast-006"},
    {"id": "ast-008", "vehicle_id": "veh-002", "type": "POUCH", "label": "Device F",   "parent_asset_id": "ast-006"},
    {"id": "ast-009", "vehicle_id": "veh-002", "type": "POUCH", "label": "Device G",   "parent_asset_id": "ast-006"},
    {"id": "ast-010", "vehicle_id": "veh-002", "type": "POUCH", "label": "Device H",   "parent_asset_id": "ast-006"},
]

MOCK_BLE_TAGS = [
    {"asset_id": "ast-002", "identifier": "AA:BB:CC:DD:EE:01", "tag_model": "Minew E8"},
    {"asset_id": "ast-003", "identifier": "AA:BB:CC:DD:EE:02", "tag_model": "Minew E8"},
    {"asset_id": "ast-004", "identifier": "AA:BB:CC:DD:EE:03", "tag_model": "Minew E8"},
    {"asset_id": "ast-005", "identifier": "AA:BB:CC:DD:EE:04", "tag_model": "Minew E8"},
    {"asset_id": "ast-007", "identifier": "AA:BB:CC:DD:EE:05", "tag_model": "Minew E8"},
    {"asset_id": "ast-008", "identifier": "AA:BB:CC:DD:EE:06", "tag_model": "Minew E8"},
    {"asset_id": "ast-009", "identifier": "AA:BB:CC:DD:EE:07", "tag_model": "Minew E8"},
    {"asset_id": "ast-010", "identifier": "AA:BB:CC:DD:EE:08", "tag_model": "Minew E8"},
]

MOCK_ASSET_STATUS = [
    {"asset_id": "ast-002", "state": "IN_VEHICLE", "last_seen_at": "2025-03-25T10:00:00Z", "last_rssi": -65},
    {"asset_id": "ast-003", "state": "IN_USE",     "last_seen_at": "2025-03-25T09:55:00Z", "last_rssi": -72},
    {"asset_id": "ast-004", "state": "MISSING",    "last_seen_at": "2025-03-25T09:30:00Z", "last_rssi": -90},
    {"asset_id": "ast-005", "state": "IN_VEHICLE", "last_seen_at": "2025-03-25T10:01:00Z", "last_rssi": -60},
    {"asset_id": "ast-007", "state": "IN_VEHICLE", "last_seen_at": "2025-03-25T10:02:00Z", "last_rssi": -58},
    {"asset_id": "ast-008", "state": "IN_VEHICLE", "last_seen_at": "2025-03-25T10:02:00Z", "last_rssi": -61},
    {"asset_id": "ast-009", "state": "MISSING",    "last_seen_at": "2025-03-25T09:45:00Z", "last_rssi": -88},
    {"asset_id": "ast-010", "state": "IN_USE",     "last_seen_at": "2025-03-25T09:50:00Z", "last_rssi": -70},
]

MOCK_ALERTS = [
    {"id": "alr-001", "asset_id": "ast-004", "vehicle_id": "veh-001", "status": "OPEN", "reason": "Asset not detected for > 300s", "opened_at": "2025-03-25T09:35:00Z", "acknowledged_at": None, "closed_at": None},
    {"id": "alr-002", "asset_id": "ast-009", "vehicle_id": "veh-002", "status": "ACK",  "reason": "Asset not detected for > 300s", "opened_at": "2025-03-25T09:48:00Z", "acknowledged_at": "2025-03-25T09:52:00Z", "closed_at": None},
]


def build_snapshot():
    tag_by_asset    = {t["asset_id"]: t for t in MOCK_BLE_TAGS}
    status_by_asset = {s["asset_id"]: s for s in MOCK_ASSET_STATUS}
    device_by_veh   = {d["vehicle_id"]: d for d in MOCK_DEVICES}
    alerts_by_veh   = {}
    for a in MOCK_ALERTS:
        alerts_by_veh.setdefault(a["vehicle_id"], []).append(a)

    vehicles_out = []
    for veh in MOCK_VEHICLES:
        vid = veh["id"]
        pi  = device_by_veh.get(vid)
        assets_out = []
        for ast in MOCK_ASSETS:
            if ast["vehicle_id"] != vid:
                continue
            tag    = tag_by_asset.get(ast["id"])
            status = status_by_asset.get(ast["id"])
            assets_out.append({
                "id":              ast["id"],
                "type":            ast["type"],
                "label":           ast["label"],
                "parent_asset_id": ast["parent_asset_id"],
                "ble_tag":  {"identifier": tag["identifier"], "tag_model": tag["tag_model"]} if tag else None,
                "status":   {"state": status["state"], "last_seen_at": status["last_seen_at"], "last_rssi": status["last_rssi"]} if status else None,
            })
        vehicles_out.append({
            "id":           veh["id"],
            "unit_number":  veh["unit_number"],
            "station_name": veh["station_name"],
            "pi_device": {"id": pi["id"], "device_name": pi["device_name"], "ip_address": pi["ip_address"], "is_active": pi["is_active"]} if pi else None,
            "assets": assets_out,
            "alerts": alerts_by_veh.get(vid, []),
        })

    return {
        "type":         "snapshot",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "vehicles":     vehicles_out,
    }


class DashboardManager:
    def __init__(self):
        self._clients: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket):
        self._clients.discard(ws)


dashboard_manager = DashboardManager()


@app.websocket("/ws/dashboard")
async def ws_dashboard(websocket: WebSocket):
    await dashboard_manager.connect(websocket)
    try:
        await websocket.send_json(build_snapshot())
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                continue
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg.get("type") == "refresh":
                await websocket.send_json(build_snapshot())
    except WebSocketDisconnect:
        dashboard_manager.disconnect(websocket)
    except Exception:
        dashboard_manager.disconnect(websocket)
        raise



if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
