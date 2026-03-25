import asyncio
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
        {"name": "Pi Health", "description": "Monitor live Raspberry Pi connectivity/heartbeat state."},
        {"name": "Bluetooth", "description": "Manage Bluetooth scanning, pairing, and removal through the Pi."},
    ],
)

latest_pi_payload: Optional[Dict[str, Any]] = None
HEARTBEAT_TIMEOUT_SECONDS = 45
HEALTH_MONITOR_INTERVAL_SECONDS = 30
health_monitor_task: Optional[asyncio.Task] = None
health_lock = asyncio.Lock()

pi_health_state: Dict[str, Dict[str, Any]] = {}


ALLOWED_DEVICES = {
    "pi-001": "6gOIpiSJ_zlS_hskU8zkIDL0kvQta5zKzsERk98uKj0",
}


async def mark_pi_alive(device_id: str):
    now = datetime.now(timezone.utc)
    async with health_lock:
        state = pi_health_state.setdefault(device_id, {})
        state["device_id"] = device_id
        state["is_alive"] = True
        state["last_seen_at"] = now.isoformat()
        state["last_seen_epoch"] = now.timestamp()
        state["last_seen_age_seconds"] = 0.0
        state["status"] = "alive"
        state["updated_at"] = now.isoformat()


async def mark_pi_offline(device_id: str, status: str):
    now = datetime.now(timezone.utc).isoformat()
    async with health_lock:
        state = pi_health_state.setdefault(device_id, {"device_id": device_id})
        state["is_alive"] = False
        state["status"] = status
        state["updated_at"] = now


async def monitor_pi_health():
    while True:
        now_epoch = datetime.now(timezone.utc).timestamp()
        async with health_lock:
            for _, state in pi_health_state.items():
                last_seen_epoch = state.get("last_seen_epoch")
                if last_seen_epoch is None:
                    state["is_alive"] = False
                    state["status"] = "never_seen"
                    state["last_seen_age_seconds"] = None
                    continue

                age_seconds = round(max(0.0, now_epoch - float(last_seen_epoch)), 1)
                state["last_seen_age_seconds"] = age_seconds
                if age_seconds > HEARTBEAT_TIMEOUT_SECONDS:
                    state["is_alive"] = False
                    state["status"] = "stale"
                else:
                    state["is_alive"] = True
                    state["status"] = "alive"
                state["updated_at"] = datetime.now(timezone.utc).isoformat()
        await asyncio.sleep(HEALTH_MONITOR_INTERVAL_SECONDS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    global health_monitor_task
    if health_monitor_task is None or health_monitor_task.done():
        health_monitor_task = asyncio.create_task(monitor_pi_health())


@app.on_event("shutdown")
async def shutdown_event():
    global health_monitor_task
    if health_monitor_task and not health_monitor_task.done():
        health_monitor_task.cancel()
        try:
            await health_monitor_task
        except asyncio.CancelledError:
            pass


@app.get("/", tags=["General"], summary="Welcome route")
def read_root():
    return {"message": "Backend is running"}


@app.post(
    "/api/pi/data",
    tags=["Pi Data"],
    summary="Receive Raspberry Pi JSON data",
    description="Accepts any non-empty JSON object sent by a Raspberry Pi and stores the latest payload in memory.",
)
async def receive_pi_data(
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

    device_id = payload.get("device_id")

    latest_pi_payload = {
        "payload": payload,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    if device_id:
        await mark_pi_alive(device_id)
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


@app.get(
    "/api/pi/health",
    tags=["Pi Health"],
    summary="Get Raspberry Pi health state",
    description="Returns in-memory health state for connected Raspberry Pi devices.",
)
async def get_pi_health():
    async with health_lock:
        return {
            "status": "success",
            "config": {
                "heartbeat_timeout_seconds": HEARTBEAT_TIMEOUT_SECONDS,
                "monitor_interval_seconds": HEALTH_MONITOR_INTERVAL_SECONDS,
            },
            "data": list(pi_health_state.values()),
            "observed_at": datetime.now(timezone.utc).isoformat(),
        }


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

        await mark_pi_alive(device_id)
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
            await mark_pi_alive(device_id)

            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif message.get("type") == "health":
                await websocket.send_json({"type": "health_ack", "status": "received"})

    except WebSocketDisconnect:
        if device_id:
            await mark_pi_offline(device_id, "disconnected")
        print(f"[DISCONNECTED] {device_id}")
    except Exception as e:
        if device_id:
            await mark_pi_offline(device_id, "error")
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
