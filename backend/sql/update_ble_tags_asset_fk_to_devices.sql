-- Switch ble_tags.asset_id to reference Raspberry Pi devices instead of assets.
-- This matches the Raspberry Pi configuration flow:
--   ble_tags.asset_id  -> devices.id
--   ble_tags.tag_model -> BLE display name
--   ble_tags.identifier -> BLE MAC address
--
-- This script removes existing ble_tags rows whose asset_id does not match a
-- Raspberry Pi in public.devices. Those rows use the old asset-based model and
-- would block the new foreign key.

begin;

alter table public.ble_tags
drop constraint if exists ble_tags_asset_id_fkey;

delete from public.ble_tags
where asset_id not in (
    select id from public.devices
);

alter table public.ble_tags
add constraint ble_tags_asset_id_fkey
foreign key (asset_id)
references public.devices(id)
on update cascade
on delete cascade;

commit;
