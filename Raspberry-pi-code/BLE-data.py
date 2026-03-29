import asyncio
import json
from datetime import datetime, timezone

from bleak import BleakScanner

TARGET_MAC = "C3:00:00:61:15:B5"


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

    little_endian_16 = s[4:8]   # e.g. c5e2
    if len(little_endian_16) != 4:
        return None

    big_endian_16 = little_endian_16[2:4] + little_endian_16[0:2]
    return big_endian_16


def parse_minew_fake_ibeacon(service_data):
    results = []

    for service_uuid, payload in service_data.items():
        service_uuid_str = str(service_uuid).lower()

        # We only know how to parse the Minew compressed UUID layout if payload is exactly 20 bytes
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

    # Return first valid battery value
    for frame in parsed:
        battery = frame.get("battery_level")
        if battery is not None:
            return battery

    return None


def detection_callback(device, advertisement_data):
    if device.address.upper() != TARGET_MAC:
        return

    manufacturer_data = advertisement_data.manufacturer_data or {}
    service_data = advertisement_data.service_data or {}

    ibeacon = parse_ibeacon(manufacturer_data)
    minew_fake_ibeacon = parse_minew_fake_ibeacon(service_data)
    battery_level = extract_battery_level(service_data)

    result = {
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

    print(json.dumps(result, indent=2))
    print("-" * 60)


async def main():
    print(f"Scanning for beacon {TARGET_MAC} for 30 seconds...\n")
    scanner = BleakScanner(detection_callback)

    async with scanner:
        await asyncio.sleep(30)

    print("\nScan finished.")


if __name__ == "__main__":
    asyncio.run(main())