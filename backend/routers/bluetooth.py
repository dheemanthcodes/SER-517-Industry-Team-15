from fastapi import APIRouter, HTTPException

try:
    from ..pi_service import get_bluetooth_data, get_paired_devices, pair_device, remove_device, scan_devices
except ImportError:
    from pi_service import get_bluetooth_data, get_paired_devices, pair_device, remove_device, scan_devices


router = APIRouter(prefix="/api/bluetooth", tags=["Bluetooth"])


@router.get("", summary="Get Bluetooth devices")
def fetch_bluetooth_info(pi_ip: str | None = None):
    try:
        data = get_bluetooth_data(pi_host=pi_ip)
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scan", summary="Scan for Bluetooth devices")
def api_scan_devices(seconds: int = 8, pi_ip: str | None = None):
    print(f"[DEBUG] Received scan request for {seconds} seconds")
    try:
        data = scan_devices(duration=seconds, pi_host=pi_ip)
        print(f"[DEBUG] Scan successful: {data}")
        return {"status": "success", "data": data}
    except Exception as e:
        print(f"[ERROR] Scan failed with exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/paired", summary="Get paired Bluetooth devices")
def api_paired_devices(pi_ip: str | None = None):
    try:
        data = get_paired_devices(pi_host=pi_ip)
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pair", summary="Pair a Bluetooth device")
def api_pair_device(payload: dict):
    mac = payload.get("mac")
    pi_ip = payload.get("pi_ip")
    if not mac:
        raise HTTPException(status_code=400, detail="Missing 'mac' in request body")
    try:
        result = pair_device(mac, pi_host=pi_ip)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/remove", summary="Remove a Bluetooth device")
def api_remove_device(payload: dict):
    mac = payload.get("mac")
    pi_ip = payload.get("pi_ip")
    if not mac:
        raise HTTPException(status_code=400, detail="Missing 'mac' in request body")
    try:
        result = remove_device(mac, pi_host=pi_ip)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
