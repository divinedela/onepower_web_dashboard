begin;

-- Ensure RLS is enabled (idempotent)
alter table if exists public.user_notification_devices enable row level security;

-- Authenticated users can manage their own device tokens
drop policy if exists user_devices_select_self on public.user_notification_devices;
create policy user_devices_select_self on public.user_notification_devices
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists user_devices_insert_self on public.user_notification_devices;
create policy user_devices_insert_self on public.user_notification_devices
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_devices_delete_self on public.user_notification_devices;
create policy user_devices_delete_self on public.user_notification_devices
for delete to authenticated
using (auth.uid() = user_id);

commit;
