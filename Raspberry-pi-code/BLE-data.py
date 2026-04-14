import asyncio
import json
import os
from datetime import datetime, timezone
from urllib import error, request

from bleak import BleakScanner

TARGET_MAC = "C3:00:00:61:15:B5"
BACKEND_PI_DATA_URL = os.getenv("BACKEND_PI_DATA_URL", "http://192.168.1.50:8000/api/pi/data")
PI_DEVICE_ID = os.getenv("PI_DEVICE_ID", "pi-001")
BATCH_INTERVAL_SECONDS = int(os.getenv("BATCH_INTERVAL_SECONDS", "60"))

pending_results = []


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def format_uuid(hex_string):
    return (
        f"{hex_string[0:8]}-"
        f"{hex_string[8:12]}-"
        f"{hex_string[12:16]}-"
        f"{hex_string[16:20]}-"
        f"{hex_string[20:32]}"
    )


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
    APPLE_COMPANY_ID = 0x004C

    payload = manufacturer_data.get(APPLE_COMPANY_ID)
    if not payload:
        return None

    if len(payload) < 23:
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
        "tx_power": tx_power
    }


def extract_short_uuid_from_service_key(service_uuid_str):
    s = service_uuid_str.lower()

    if not s.startswith("0000") or len(s) < 8:
        return None

    little_endian_16 = s[4:8]
    if len(little_endian_16) != 4:
        return None

    big_endian_16 = little_endian_16[2:4] + little_endian_16[0:2]
    return big_endian_16


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

        results.append({
            "service_uuid": service_uuid_str,
            "uuid": format_uuid(full_uuid_hex),
            "major": major,
            "minor": minor,
            "tx_power": tx_power,
            "battery_level": battery_level
        })

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

    ibeacon = parse_ibeacon(manufacturer_data)
    minew_fake_ibeacon = parse_minew_fake_ibeacon(service_data)
    battery_level = extract_battery_level(service_data)

    return {
        "device_id": PI_DEVICE_ID,
        "address": device.address,
        "name": device.name or advertisement_data.local_name,
        "rssi": advertisement_data.rssi,
        "timestamp": now_iso(),
        "manufacturer_data": normalize_manufacturer_data(manufacturer_data),
        "service_data": normalize_service_data(service_data),
        "service_uuids": advertisement_data.service_uuids,
        "ibeacon": ibeacon,
        "battery_level": battery_level,
        "minew_fake_ibeacon": minew_fake_ibeacon
    }


def detection_callback(device, advertisement_data):
    if device.address.upper() != TARGET_MAC:
        return

    result = build_result(device, advertisement_data)
    pending_results.append(result)

    print(json.dumps(result, indent=2))
    print(f"Queued records: {len(pending_results)}")
    print("-" * 60)


def post_batch(batch):
    payload = json.dumps({
        "device_id": PI_DEVICE_ID,
        "sent_at": now_iso(),
        "records": batch,
    }).encode("utf-8")

    http_request = request.Request(
        BACKEND_PI_DATA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with request.urlopen(http_request, timeout=15) as response:
        return response.status, response.read().decode("utf-8")


async def flush_batches_periodically():
    while True:
        await asyncio.sleep(BATCH_INTERVAL_SECONDS)

        batch = list(pending_results)

        try:
            status, response_body = await asyncio.to_thread(post_batch, batch)
            if batch:
                del pending_results[:len(batch)]
            print(f"Sent batch with {len(batch)} records to backend. Status: {status}")
            print(response_body)
        except error.URLError as exc:
            print(f"Failed to send batch to backend: {exc}")
        except Exception as exc:
            print(f"Unexpected error sending batch: {exc}")


async def main():
    print(f"Scanning continuously for beacon {TARGET_MAC}")
    print(f"Batch upload target: {BACKEND_PI_DATA_URL}")
    print(f"Batch interval: {BATCH_INTERVAL_SECONDS} seconds\n")

    scanner = BleakScanner(detection_callback)
    flush_task = asyncio.create_task(flush_batches_periodically())

    async with scanner:
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            print("\nStopping scan...")
        finally:
            flush_task.cancel()
            await asyncio.gather(flush_task, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
