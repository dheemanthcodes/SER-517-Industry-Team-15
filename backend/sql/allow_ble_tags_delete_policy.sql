-- Allow BLE tag deletes from the Raspberry Pi pairing flow.
-- Use this if the backend is operating with anon/authenticated credentials
-- instead of the service role key.

create policy ble_tags_delete_ble_pairing
on public.ble_tags
for delete
to anon, authenticated
using (true);
