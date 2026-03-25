import asyncio
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from alert_logic import clear_alert, clear_state_alerts, set_alert, update_low_battery_alert
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

# NEW CODE START
HEARTBEAT_STALE_AFTER = timedelta(seconds=30)
ASSET_IN_VEHICLE_THRESHOLD = timedelta(seconds=10)
ASSET_DISCONNECTED_THRESHOLD = timedelta(seconds=30)
ASSET_IN_USE_OVERDUE_AFTER = timedelta(minutes=20)
ASSET_MISSING_CONFIRMED_AFTER = timedelta(seconds=60)
ASSET_EVALUATION_INTERVAL_SECONDS = 10

ASSET_STATE_UNKNOWN = "UNKNOWN"
ASSET_STATE_IN_VEHICLE = "IN_VEHICLE"
ASSET_STATE_DISCONNECTED_PENDING = "DISCONNECTED_PENDING"
ASSET_STATE_IN_USE = "IN_USE"
ASSET_STATE_OVERDUE = "OVERDUE"
ASSET_STATE_MISSING_CONFIRMED = "MISSING_CONFIRMED"

ALERT_TYPE_MISSING = "MISSING"
ALERT_TYPE_OVERDUE = "OVERDUE"
ALERT_TYPE_LOW_BATTERY = "LOW_BATTERY"
ALERT_TYPE_DEVICE_OFFLINE = "DEVICE_OFFLINE"

# FIX START
if "pi_health_state" not in globals():
    pi_health_state: Dict[str, Dict[str, Any]] = {}
# FIX END
asset_state_map: Dict[str, Dict[str, Any]] = {}
alert_state_map: Dict[str, Dict[str, Dict[str, Any]]] = {}
asset_evaluator_task: Optional[asyncio.Task] = None
pi_health_monitor_task: Optional[asyncio.Task] = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None

    normalized_value = value.strip()
    if normalized_value.endswith("Z"):
        normalized_value = normalized_value[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(normalized_value)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _get_snapshot_timestamp(payload: Dict[str, Any]) -> datetime:
    return _parse_iso_datetime(payload.get("timestamp")) or _utc_now()


def _normalize_movement_state(payload: Dict[str, Any]) -> str:
    movement = payload.get("movement")
    if not isinstance(movement, dict):
        return "UNKNOWN"

    state = movement.get("state")
    if not isinstance(state, str):
        return "UNKNOWN"

    normalized_state = state.strip().upper()
    return normalized_state if normalized_state in {"MOVING", "STATIONARY"} else "UNKNOWN"


def _extract_location(payload: Dict[str, Any]) -> Optional[Dict[str, float]]:
    location = payload.get("location")
    if not isinstance(location, dict):
        return None

    lat = location.get("lat")
    lng = location.get("lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        return {"lat": float(lat), "lng": float(lng)}

    return None


def _set_asset_state(asset_id: str, asset_record: Dict[str, Any], next_state: str) -> None:
    previous_state = asset_record.get("current_state")
    if previous_state == next_state:
        return

    asset_record["previous_state"] = previous_state
    asset_record["current_state"] = next_state
    asset_record["state_changed_at"] = _utc_now().isoformat()


def _device_is_alive(device_id: Optional[str]) -> bool:
    if not device_id:
        return False

    device_health = pi_health_state.get(device_id)
    if not isinstance(device_health, dict):
        return False

    return bool(device_health.get("is_alive"))


# FIX START
if "mark_pi_alive" not in globals():
    async def mark_pi_alive(device_id: Optional[str]) -> None:
        if not device_id:
            return

        pi_health_state[device_id] = {
            "last_seen_at": _utc_now(),
            "is_alive": True,
        }


if "monitor_pi_health" not in globals():
    async def monitor_pi_health() -> None:
        while True:
            now = _utc_now()
            for device_id, device_health in list(pi_health_state.items()):
                last_seen_at = device_health.get("last_seen_at")
                if not isinstance(last_seen_at, datetime):
                    continue

                pi_health_state[device_id]["is_alive"] = (now - last_seen_at) <= HEARTBEAT_STALE_AFTER

            await asyncio.sleep(ASSET_EVALUATION_INTERVAL_SECONDS)
# FIX END


def process_payload(payload: Dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        return

    if payload.get("type") == "snapshot":
        handle_snapshot(payload)


def handle_snapshot(payload: Dict[str, Any]) -> None:
    device_id = payload.get("device_id")
    if not isinstance(device_id, str) or not device_id.strip():
        return

    snapshot_timestamp = _get_snapshot_timestamp(payload)
    movement_state = _normalize_movement_state(payload)
    location = _extract_location(payload)
    assets = payload.get("assets")

    if not isinstance(assets, list):
        return

    for asset in assets:
        if not isinstance(asset, dict):
            continue

        asset_id = asset.get("asset_id")
        if not isinstance(asset_id, str) or not asset_id.strip():
            continue

        asset_last_seen_at = _parse_iso_datetime(asset.get("last_seen_at")) or snapshot_timestamp
        existing_asset = asset_state_map.get(asset_id)
        existing_last_seen_at = existing_asset.get("last_seen_at") if existing_asset else None

        if isinstance(existing_last_seen_at, datetime) and asset_last_seen_at < existing_last_seen_at:
            continue

        asset_state_map[asset_id] = {
            "asset_id": asset_id,
            "last_seen_at": asset_last_seen_at,
            "current_state": existing_asset.get("current_state", ASSET_STATE_UNKNOWN) if existing_asset else ASSET_STATE_UNKNOWN,
            "previous_state": existing_asset.get("previous_state") if existing_asset else None,
            "device_id": device_id,
            "movement_state": movement_state,
            "location": location,
            "battery_level": asset.get("battery_level"),
            "vehicle_id": payload.get("vehicle_id"),
            "state_changed_at": existing_asset.get("state_changed_at") if existing_asset else None,
        }


def evaluate_asset_states() -> None:
    now = _utc_now()

    for asset_id, asset_record in asset_state_map.items():
        device_id = asset_record.get("device_id")

        if not _device_is_alive(device_id):
            _set_asset_state(asset_id, asset_record, ASSET_STATE_UNKNOWN)
            clear_state_alerts(alert_state_map, asset_id, ALERT_TYPE_MISSING, ALERT_TYPE_OVERDUE, _utc_now)
            set_alert(alert_state_map, asset_id, ALERT_TYPE_DEVICE_OFFLINE, "high", "Device heartbeat is offline", _utc_now)
            continue

        clear_alert(alert_state_map, asset_id, ALERT_TYPE_DEVICE_OFFLINE, _utc_now)

        last_seen_at = asset_record.get("last_seen_at")
        if not isinstance(last_seen_at, datetime):
            _set_asset_state(asset_id, asset_record, ASSET_STATE_UNKNOWN)
            continue

        time_since_last_seen = now - last_seen_at
        movement_state = asset_record.get("movement_state")

        if time_since_last_seen < ASSET_IN_VEHICLE_THRESHOLD:
            next_state = ASSET_STATE_IN_VEHICLE
        elif time_since_last_seen <= ASSET_DISCONNECTED_THRESHOLD:
            next_state = ASSET_STATE_DISCONNECTED_PENDING
        elif movement_state == "UNKNOWN":
            next_state = ASSET_STATE_DISCONNECTED_PENDING
        elif movement_state == "STATIONARY":
            next_state = ASSET_STATE_IN_USE
            if time_since_last_seen > ASSET_IN_USE_OVERDUE_AFTER:
                next_state = ASSET_STATE_OVERDUE
        elif movement_state == "MOVING" and time_since_last_seen > ASSET_MISSING_CONFIRMED_AFTER:
            next_state = ASSET_STATE_MISSING_CONFIRMED
        else:
            next_state = ASSET_STATE_DISCONNECTED_PENDING

        previous_state = asset_record.get("current_state")
        _set_asset_state(asset_id, asset_record, next_state)
        state_changed = previous_state != next_state

        if next_state == ASSET_STATE_IN_VEHICLE:
            clear_state_alerts(alert_state_map, asset_id, ALERT_TYPE_MISSING, ALERT_TYPE_OVERDUE, _utc_now)
        elif state_changed and next_state == ASSET_STATE_OVERDUE:
            set_alert(alert_state_map, asset_id, ALERT_TYPE_OVERDUE, "low", "Asset overdue while stationary", _utc_now)
        elif state_changed and next_state == ASSET_STATE_MISSING_CONFIRMED:
            set_alert(alert_state_map, asset_id, ALERT_TYPE_MISSING, "high", "Asset missing while vehicle is moving", _utc_now)

        update_low_battery_alert(alert_state_map, asset_id, asset_record.get("battery_level"), ALERT_TYPE_LOW_BATTERY, _utc_now)


async def evaluate_asset_states_loop() -> None:
    while True:
        evaluate_asset_states()
        await asyncio.sleep(ASSET_EVALUATION_INTERVAL_SECONDS)


@app.on_event("startup")
async def startup_asset_logic() -> None:
    global asset_evaluator_task, pi_health_monitor_task

    # FIX START
    if asset_evaluator_task is None or asset_evaluator_task.done():
        asset_evaluator_task = asyncio.create_task(evaluate_asset_states_loop())
    # FIX END


@app.on_event("shutdown")
async def shutdown_event() -> None:
    for task in (pi_health_monitor_task, asset_evaluator_task):
        if task is None:
            continue

        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

# NEW CODE END

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

    latest_pi_payload = {
        "payload": payload,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    # NEW CODE START
    device_id = payload.get("device_id")
    # FIX START
    await mark_pi_alive(device_id)
    # FIX END
    process_payload(payload)
    # NEW CODE END
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

            # NEW CODE START
            await mark_pi_alive(device_id)
            process_payload(message)
            # NEW CODE END

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
