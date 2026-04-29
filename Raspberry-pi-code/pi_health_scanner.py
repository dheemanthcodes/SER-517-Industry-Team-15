import asyncio
import json
import os
import socket
from datetime import datetime, timezone
from urllib import error, request

from bleak import BleakScanner


BACKEND_HEARTBEAT_URL = os.getenv(
    "BACKEND_HEARTBEAT_URL",
    "https://ser-517-industry-team-15.onrender.com/api/pi/heartbeat",
)
BACKEND_PI_DATA_URL = os.getenv(
    "BACKEND_PI_DATA_URL",
    "https://ser-517-industry-team-15.onrender.com/api/pi/data",
)
PI_ID = os.getenv("PI_ID", "").strip()
pi_name = os.getenv("PI_NAME", "unknown-pi").strip()
PI_NAME = pi_name
PI_IP_ADDRESS = os.getenv("PI_IP_ADDRESS", "").strip()
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "120"))
BATCH_INTERVAL_SECONDS = int(os.getenv("BATCH_INTERVAL_SECONDS", "60"))
HTTP_TIMEOUT_SECONDS = int(os.getenv("HTTP_TIMEOUT_SECONDS", "15"))

pending_results = []
tracked_ble_mappings = []
tracked_mac_addresses = set()
seen_mac_addresses_in_interval = set()
last_detection_at = None
last_detection_rssi = None
current_batch_started_at = None


def now_iso():
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def get_local_ip_address():
    if PI_IP_ADDRESS:
        return PI_IP_ADDRESS

    probe_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe_socket.connect(("8.8.8.8", 80))
        return probe_socket.getsockname()[0]
    except OSError:
        return ""
    finally:
        probe_socket.close()


def format_uuid(hex_string):
    return (
        f"{hex_string[0:8]}-"
        f"{hex_string[8:12]}-"
        f"{hex_string[12:16]}-"
        f"{hex_string[16:20]}-"
        f"{hex_string[20:32]}"
    )


def normalize_mac_address(value):
    return str(value or "").strip().replace("-", ":").upper()


def normalize_manufacturer_data(manufacturer_data):
    cleaned = {}
    for company_id, payload in manufacturer_data.items():
        cleaned[f"0x{company_id:04X}"] = payload.hex()
    return cleaned


def normalize_service_data(service_data):
    cleaned = {}
    for uuid, payload in service_data.items():
        cleaned[str(uuid)] = payload.hex()
    return cleaned


def parse_ibeacon(manufacturer_data):
    apple_company_id = 0x004C

    payload = manufacturer_data.get(apple_company_id)
    if not payload or len(payload) < 23:
        return None

    if payload[0] != 0x02 or payload[1] != 0x15:
        return None

    uuid_hex = payload[2:18].hex()
    major = int.from_bytes(payload[18:20], byteorder="big")
    minor = int.from_bytes(payload[20:22], byteorder="big")
    tx_power = int.from_bytes(payload[22:23], byteorder="big", signed=True)

    return {
        "uuid": format_uuid(uuid_hex),
        "major": major,
        "minor": minor,
        "tx_power": tx_power,
    }


def extract_short_uuid_from_service_key(service_uuid_str):
    service_uuid = service_uuid_str.lower()

    if not service_uuid.startswith("0000") or len(service_uuid) < 8:
        return None

    little_endian_16 = service_uuid[4:8]
    if len(little_endian_16) != 4:
        return None

    return little_endian_16[2:4] + little_endian_16[0:2]


def parse_minew_fake_ibeacon(service_data):
    results = []

    for service_uuid, payload in service_data.items():
        service_uuid_str = str(service_uuid).lower()

        if len(payload) != 20:
            continue

        first_2_uuid_bytes = extract_short_uuid_from_service_key(service_uuid_str)
        if first_2_uuid_bytes is None:
            continue

        remaining_14_uuid_bytes = payload[0:14].hex()
        full_uuid_hex = first_2_uuid_bytes + remaining_14_uuid_bytes

        if len(full_uuid_hex) != 32:
            continue

        major = int.from_bytes(payload[14:16], byteorder="big")
        minor = int.from_bytes(payload[16:18], byteorder="big")
        tx_power = int.from_bytes(payload[18:19], byteorder="big", signed=True)
        battery_level = payload[19]

        results.append(
            {
                "service_uuid": service_uuid_str,
                "uuid": format_uuid(full_uuid_hex),
                "major": major,
                "minor": minor,
                "tx_power": tx_power,
                "battery_level": battery_level,
            }
        )

    return results if results else None


def extract_battery_level(service_data):
    parsed = parse_minew_fake_ibeacon(service_data)
    if not parsed:
        return None

    for frame in parsed:
        battery = frame.get("battery_level")
        if battery is not None:
            return battery

    return None


def build_result(device, advertisement_data):
    manufacturer_data = advertisement_data.manufacturer_data or {}
    service_data = advertisement_data.service_data or {}
    normalized_address = normalize_mac_address(device.address)
    mapping = next(
        (
            item
            for item in tracked_ble_mappings
            if item.get("mac_address") == normalized_address
        ),
        None,
    )

    return {
        "device_id": PI_ID or PI_NAME,
        "device_name": PI_NAME,
        "pi_id": PI_ID or None,
        "pi_name": PI_NAME,
        "address": normalized_address,
        "name": device.name
        or advertisement_data.local_name
        or (mapping or {}).get("name"),
        "mapped_name": (mapping or {}).get("name"),
        "ble_tag_id": (mapping or {}).get("ble_tag_id"),
        "rssi": advertisement_data.rssi,
        "timestamp": now_iso(),
        "manufacturer_data": normalize_manufacturer_data(manufacturer_data),
        "service_data": normalize_service_data(service_data),
        "service_uuids": advertisement_data.service_uuids,
        "ibeacon": parse_ibeacon(manufacturer_data),
        "battery_level": extract_battery_level(service_data),
        "minew_fake_ibeacon": parse_minew_fake_ibeacon(service_data),
    }


def build_missing_result(mapping, timestamp):
    mac_address = normalize_mac_address(mapping.get("mac_address"))

    return {
        "device_id": PI_ID or PI_NAME,
        "device_name": PI_NAME,
        "pi_id": PI_ID or None,
        "pi_name": PI_NAME,
        "address": mac_address,
        "name": mapping.get("name") or mac_address,
        "mapped_name": mapping.get("name") or mac_address,
        "ble_tag_id": mapping.get("ble_tag_id"),
        "rssi": None,
        "timestamp": timestamp,
        "state": "MISSING",
        "manufacturer_data": {},
        "service_data": {},
        "service_uuids": [],
        "ibeacon": None,
        "battery_level": None,
        "minew_fake_ibeacon": None,
    }


def detection_callback(device, advertisement_data):
    global last_detection_at, last_detection_rssi

    normalized_address = normalize_mac_address(device.address)
    if normalized_address not in tracked_mac_addresses:
        return

    result = build_result(device, advertisement_data)
    pending_results.append(result)
    seen_mac_addresses_in_interval.add(normalized_address)
    last_detection_at = result["timestamp"]
    last_detection_rssi = result["rssi"]

    print(json.dumps(result, indent=2))
    print(f"Queued records: {len(pending_results)}")
    print("-" * 60)


def post_json(url, payload):
    encoded_payload = json.dumps(payload).encode("utf-8")
    http_request = request.Request(
        url,
        data=encoded_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with request.urlopen(http_request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        response_body = response.read().decode("utf-8")
        return response.status, response_body


def build_heartbeat_payload(scanner_status):
    return {
        "pi_id": PI_ID or None,
        "pi_name": PI_NAME,
        "ip_address": get_local_ip_address(),
        "scanner_status": scanner_status,
        "observed_at": now_iso(),
    }


def post_heartbeat(scanner_status):
    status_code, response_body = post_json(
        BACKEND_HEARTBEAT_URL,
        build_heartbeat_payload(scanner_status),
    )
    parsed_body = json.loads(response_body) if response_body else {}
    return status_code, parsed_body


def update_tracked_mappings(ble_mappings):
    global tracked_ble_mappings, tracked_mac_addresses

    normalized_mappings = []
    for mapping in ble_mappings or []:
        mac_address = normalize_mac_address(mapping.get("mac_address"))
        if not mac_address:
            continue
        normalized_mappings.append(
            {
                "ble_tag_id": mapping.get("ble_tag_id"),
                "name": mapping.get("name") or mac_address,
                "mac_address": mac_address,
            }
        )

    tracked_ble_mappings = normalized_mappings
    tracked_mac_addresses = {mapping["mac_address"] for mapping in normalized_mappings}


async def heartbeat_loop():
    while True:
        try:
            status_code, response_payload = await asyncio.to_thread(
                post_heartbeat, "running"
            )
            heartbeat_data = response_payload.get("data") or {}
            update_tracked_mappings(heartbeat_data.get("ble_mappings") or [])

            print(
                f"Heartbeat sent successfully. Status: {status_code}. "
                f"Tracking {len(tracked_mac_addresses)} BLE device(s)."
            )
        except error.HTTPError as exc:
            print(f"Heartbeat failed with HTTP error: {exc.code} {exc.reason}")
        except error.URLError as exc:
            print(f"Heartbeat failed to reach backend: {exc}")
        except Exception as exc:
            print(f"Unexpected heartbeat error: {exc}")

        await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)


def post_batch(batch, batch_started_at, batch_sent_at):
    payload = {
        "device_id": PI_ID or None,
        "device_name": PI_NAME,
        "pi_name": PI_NAME,
        "pi_id": PI_ID or None,
        "scanner_status": "running",
        "tracked_mac_addresses": sorted(tracked_mac_addresses),
        "batch_started_at": batch_started_at,
        "sent_at": batch_sent_at,
        "has_detection": bool(batch),
        "records_count": len(batch),
        "last_detection_at": last_detection_at,
        "last_known_rssi": last_detection_rssi,
        "records": batch,
    }
    return post_json(BACKEND_PI_DATA_URL, payload)


async def flush_batches_periodically():
    global current_batch_started_at

    while True:
        await asyncio.sleep(BATCH_INTERVAL_SECONDS)

        batch_sent_at = now_iso()
        batch_started_at = current_batch_started_at
        missing_records = [
            build_missing_result(mapping, batch_sent_at)
            for mapping in tracked_ble_mappings
            if mapping.get("mac_address") not in seen_mac_addresses_in_interval
        ]
        batch = list(pending_results) + missing_records

        try:
            print(
                f"Sending batch to backend. Records: {len(batch)}. "
                f"Missing records: {len(missing_records)}"
            )
            status_code, response_body = await asyncio.to_thread(
                post_batch,
                batch,
                batch_started_at,
                batch_sent_at,
            )
            pending_results.clear()
            seen_mac_addresses_in_interval.clear()
            current_batch_started_at = batch_sent_at
            print(
                f"Sent batch with {len(batch)} record(s) to backend. "
                f"Status: {status_code}"
            )
            print(response_body)
        except error.HTTPError as exc:
            print(f"Failed to send batch: HTTP {exc.code} {exc.reason}")
        except error.URLError as exc:
            print(f"Failed to send batch to backend: {exc}")
        except Exception as exc:
            print(f"Unexpected error sending batch: {exc}")


async def main():
    global current_batch_started_at

    current_batch_started_at = now_iso()

    print(f"Pi name: {PI_NAME}")
    print(f"Heartbeat URL: {BACKEND_HEARTBEAT_URL}")
    print(f"Data upload URL: {BACKEND_PI_DATA_URL}")
    print(f"Heartbeat interval: {HEARTBEAT_INTERVAL_SECONDS} seconds")
    print(f"Batch interval: {BATCH_INTERVAL_SECONDS} seconds")

    try:
        status_code, response_payload = await asyncio.to_thread(
            post_heartbeat, "starting"
        )
        heartbeat_data = response_payload.get("data") or {}
        update_tracked_mappings(heartbeat_data.get("ble_mappings") or [])
        print(
            f"Startup heartbeat acknowledged. Status: {status_code}. "
            f"Tracking {len(tracked_mac_addresses)} BLE device(s)."
        )
    except Exception as exc:
        print(f"Startup heartbeat failed: {exc}")

    if tracked_mac_addresses:
        print(f"Initial tracked MAC addresses: {sorted(tracked_mac_addresses)}")
    else:
        print(
            "No BLE mappings assigned yet. Scanner will stay running and wait for heartbeat updates."
        )

    scanner = BleakScanner(detection_callback)
    heartbeat_task = asyncio.create_task(heartbeat_loop())
    flush_task = asyncio.create_task(flush_batches_periodically())

    async with scanner:
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            print("\nStopping scan...")
        finally:
            heartbeat_task.cancel()
            flush_task.cancel()
            await asyncio.gather(heartbeat_task, flush_task, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
