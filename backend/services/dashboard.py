try:
    from ..config import supabase
except ImportError:
    from config import supabase


def build_snapshot():
    vehicles = supabase.table("vehicles").select("*").execute().data or []
    devices = supabase.table("devices").select("*").eq("is_active", True).execute().data or []
    assets = supabase.table("assets").select("*").execute().data or []
    ble_tags = supabase.table("ble_tags").select("*").execute().data or []

    vehicle_by_id = {v.get("id"): v for v in vehicles if v.get("id")}
    tag_by_asset = {t.get("asset_id"): t for t in ble_tags if t.get("asset_id")}
    assets_by_vehicle = {}

    for asset in assets:
        vehicle_id = asset.get("vehicle_id")
        if not vehicle_id:
            continue
        assets_by_vehicle.setdefault(vehicle_id, []).append(asset)

    ui_snapshot = {}

    for device in devices:
        device_name = (device.get("device_name") or "").strip()
        if not device_name:
            continue

        vehicle_id = device.get("vehicle_id")
        vehicle = vehicle_by_id.get(vehicle_id) if vehicle_id else None
        vehicle_assets = assets_by_vehicle.get(vehicle_id, []) if vehicle_id else []

        tracked_devices = []
        for asset in vehicle_assets:
            tag = tag_by_asset.get(asset.get("id"))
            if not tag:
                continue
            tracked_devices.append(
                {
                    "name": asset.get("label") or tag.get("asset_id"),
                    "address": tag.get("identifier"),
                }
            )

        ui_snapshot[device_name] = {
            "ambulanceId": vehicle.get("unit_number") if vehicle else None,
            "ipAddress": device.get("ip_address"),
            "devices": tracked_devices,
        }

    return ui_snapshot


def build_device_management_payload():
    vehicles = supabase.table("vehicles").select("*").execute().data or []
    devices = supabase.table("devices").select("*").eq("is_active", True).execute().data or []
    assets = supabase.table("assets").select("*").execute().data or []
    ble_tags = supabase.table("ble_tags").select("*").execute().data or []

    device_by_vehicle = {d.get("vehicle_id"): d for d in devices if d.get("vehicle_id")}
    ble_by_asset = {t.get("asset_id"): t for t in ble_tags if t.get("asset_id")}

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
            tag = ble_by_asset.get(asset.get("id"))

            payload = {
                "asset_id": asset.get("id"),
                "label": asset.get("label"),
                "ble_mac_address": tag.get("identifier") if tag else None,
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
                    "ip_address": pi_device.get("ip_address"),
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
    vehicles = supabase.table("vehicles").select("*").execute().data or []
    devices = supabase.table("devices").select("*").eq("is_active", True).execute().data or []
    assets = supabase.table("assets").select("*").execute().data or []
    ble_tags = supabase.table("ble_tags").select("*").execute().data or []

    device_by_vehicle_id = {
        device.get("vehicle_id"): device for device in devices if device.get("vehicle_id")
    }
    ble_tag_by_asset_id = {
        ble_tag.get("asset_id"): ble_tag for ble_tag in ble_tags if ble_tag.get("asset_id")
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
                    "ip_address": device.get("ip_address") if device else None,
                    "asset_id": None,
                    "asset_type": None,
                    "label": None,
                    "parent_asset_id": None,
                    "ble_identifier": None,
                    "tag_model": None,
                }
            )
            continue

        for asset in vehicle_assets:
            asset_id = asset.get("id")
            ble_tag = ble_tag_by_asset_id.get(asset_id)

            rows.append(
                {
                    "vehicle_id": vehicle.get("id"),
                    "unit_number": vehicle.get("unit_number"),
                    "station_name": vehicle.get("station_name"),
                    "device_name": device.get("device_name") if device else None,
                    "ip_address": device.get("ip_address") if device else None,
                    "asset_id": asset_id,
                    "asset_type": asset.get("type"),
                    "label": asset.get("label"),
                    "parent_asset_id": asset.get("parent_asset_id"),
                    "ble_identifier": ble_tag.get("identifier") if ble_tag else None,
                    "tag_model": ble_tag.get("tag_model") if ble_tag else None,
                }
            )

    return rows
