try:
    from ..config import supabase
except ImportError:
    from config import supabase


def _safe_fetch_table_rows(table_name, *, filters=None, required=False):
    query = supabase.table(table_name).select("*")

    for filter_name, args in filters or []:
        query = getattr(query, filter_name)(*args)

    try:
        return query.execute().data or []
    except Exception as exc:
        if required:
            raise RuntimeError(f"Failed to fetch '{table_name}': {exc}") from exc

        print(f"[WARN] Failed to fetch optional table '{table_name}': {exc}")
        return []


def _get_device_ip(device):
    return (
        device.get("ip_address")
        or device.get("ipAddress")
        or device.get("ip")
        or device.get("device_ip")
    )


def build_snapshot():
    vehicles = _safe_fetch_table_rows("vehicles")
    devices = _safe_fetch_table_rows(
        "devices",
        filters=[("eq", ("is_active", True))],
        required=True,
    )
    ble_tags = _safe_fetch_table_rows("ble_tags")

    vehicle_by_id = {v.get("id"): v for v in vehicles if v.get("id")}
    tags_by_device_id = {}
    for tag in ble_tags:
        device_id = tag.get("asset_id")
        if not device_id:
            continue
        tags_by_device_id.setdefault(device_id, []).append(tag)

    ui_snapshot = {}

    for device in devices:
        device_id = device.get("id")
        device_name = (device.get("device_name") or "").strip()
        if not device_name:
            continue

        vehicle_id = device.get("vehicle_id")
        vehicle = vehicle_by_id.get(vehicle_id) if vehicle_id else None
        tracked_devices = []
        for tag in tags_by_device_id.get(device_id, []):
            tracked_devices.append(
                {
                    "id": tag.get("id"),
                    "name": tag.get("tag_model") or tag.get("identifier") or "Unnamed BLE Device",
                    "address": tag.get("identifier"),
                    "asset_id": device_id,
                }
            )

        ui_snapshot[device_name] = {
            "id": device_id,
            "ambulanceId": vehicle.get("unit_number") if vehicle else None,
            "ipAddress": _get_device_ip(device),
            "devices": tracked_devices,
        }

    return ui_snapshot


def build_device_management_payload():
    vehicles = _safe_fetch_table_rows("vehicles", required=True)
    devices = _safe_fetch_table_rows(
        "devices",
        filters=[("eq", ("is_active", True))],
    )
    assets = _safe_fetch_table_rows(
        "assets",
        filters=[("neq", ("is_active", False))],
    )
    ble_tags = _safe_fetch_table_rows("ble_tags")

    device_by_vehicle = {d.get("vehicle_id"): d for d in devices if d.get("vehicle_id")}
    ble_by_identifier = {
        (t.get("identifier") or "").strip(): t
        for t in ble_tags
        if (t.get("identifier") or "").strip()
    }

    vehicles_out = []
    for veh in vehicles:
        vid = veh.get("id")
        if not vid:
            continue

        pi_device = device_by_vehicle.get(vid)
        vehicle_assets = [a for a in assets if a.get("vehicle_id") == vid]
        boxes = []
        pouches = []

        for asset in vehicle_assets:
            asset_type = (asset.get("type") or "").upper()
            asset_ble_identifier = (asset.get("ble_identifier") or "").strip()
            tag = ble_by_identifier.get(asset_ble_identifier)

            payload = {
                "asset_id": asset.get("id"),
                "label": asset.get("label"),
                "ble_mac_address": asset_ble_identifier or None,
                "parent_asset_id": asset.get("parent_asset_id"),
            }

            if asset_type == "BOX":
                boxes.append(payload)
            elif asset_type == "POUCH":
                pouches.append(payload)

        vehicles_out.append(
            {
                "vehicle_id": vid,
                "ambulance_number": veh.get("unit_number"),
                "station": veh.get("station_name"),
                "raspberry_pi": {
                    "id": pi_device.get("id"),
                    "name": pi_device.get("device_name"),
                    "ip_address": _get_device_ip(pi_device),
                    "is_active": pi_device.get("is_active"),
                }
                if pi_device
                else None,
                "boxes": boxes,
                "pouches": pouches,
            }
        )

    return {"vehicles": vehicles_out}


def build_all_details_payload():
    vehicles = _safe_fetch_table_rows("vehicles", required=True)
    devices = _safe_fetch_table_rows(
        "devices",
        filters=[("eq", ("is_active", True))],
    )
    assets = _safe_fetch_table_rows(
        "assets",
        filters=[("neq", ("is_active", False))],
    )
    ble_tags = _safe_fetch_table_rows("ble_tags")

    device_by_vehicle_id = {
        device.get("vehicle_id"): device for device in devices if device.get("vehicle_id")
    }
    ble_tag_by_identifier = {
        (ble_tag.get("identifier") or "").strip(): ble_tag
        for ble_tag in ble_tags
        if (ble_tag.get("identifier") or "").strip()
    }
    assets_by_vehicle_id = {}

    for asset in assets:
        vehicle_id = asset.get("vehicle_id")
        if not vehicle_id:
            continue
        assets_by_vehicle_id.setdefault(vehicle_id, []).append(asset)

    rows = []
    for vehicle in vehicles:
        vehicle_id = vehicle.get("id")
        if not vehicle_id:
            continue

        device = device_by_vehicle_id.get(vehicle_id)
        vehicle_assets = assets_by_vehicle_id.get(vehicle_id, [])
        if not vehicle_assets:
            rows.append(
                {
                    "vehicle_id": vehicle.get("id"),
                    "unit_number": vehicle.get("unit_number"),
                    "station_name": vehicle.get("station_name"),
                    "device_name": device.get("device_name") if device else None,
                    "ip_address": _get_device_ip(device) if device else None,
                    "asset_id": None,
                    "asset_type": None,
                    "label": None,
                    "ble_identifier": None,
                    "parent_asset_id": None,
                    "tag_model": None,
                }
            )
            continue

        for asset in vehicle_assets:
            asset_id = asset.get("id")
            ble_identifier = (asset.get("ble_identifier") or "").strip()
            ble_tag = ble_tag_by_identifier.get(ble_identifier)

            rows.append(
                {
                    "vehicle_id": vehicle.get("id"),
                    "unit_number": vehicle.get("unit_number"),
                    "station_name": vehicle.get("station_name"),
                    "device_name": device.get("device_name") if device else None,
                    "ip_address": _get_device_ip(device) if device else None,
                    "asset_id": asset_id,
                    "asset_type": asset.get("type"),
                    "label": asset.get("label"),
                    "ble_identifier": ble_identifier or None,
                    "parent_asset_id": asset.get("parent_asset_id"),
                    "tag_model": ble_tag.get("tag_model") if ble_tag else None,
                }
            )

    return rows
