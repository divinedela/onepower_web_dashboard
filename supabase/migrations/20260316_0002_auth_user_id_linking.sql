begin;

-- ------------------------------------------------------------
-- Link app profile/admin rows to Supabase Auth users
-- ------------------------------------------------------------
alter table public.users
  add column if not exists auth_user_id uuid;

alter table public.admin_logins
  add column if not exists auth_user_id uuid;

create unique index if not exists uq_users_auth_user_id
  on public.users(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists uq_admin_logins_auth_user_id
  on public.admin_logins(auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_users_auth_user_id
  on public.users(auth_user_id);

create index if not exists idx_admin_logins_auth_user_id
  on public.admin_logins(auth_user_id);

-- ------------------------------------------------------------
-- Backfill by normalized email -> auth.users.id
-- ------------------------------------------------------------
with matched_users as (
  select
    u.id as app_user_id,
    au.id as auth_user_id
  from public.users u
  join auth.users au
    on lower(trim(coalesce(u.email::text, ''))) = lower(trim(coalesce(au.email, '')))
)
update public.users u
set auth_user_id = m.auth_user_id
from matched_users m
where u.id = m.app_user_id
  and (u.auth_user_id is distinct from m.auth_user_id);

with matched_admins as (
  select
    a.id as app_admin_id,
    au.id as auth_user_id
  from public.admin_logins a
  join auth.users au
    on lower(trim(coalesce(a.email::text, ''))) = lower(trim(coalesce(au.email, '')))
)
update public.admin_logins a
set auth_user_id = m.auth_user_id
from matched_admins m
where a.id = m.app_admin_id
  and (a.auth_user_id is distinct from m.auth_user_id);

-- ------------------------------------------------------------
-- RLS ownership policies via auth_user_id mapping
-- ------------------------------------------------------------
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
for select to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
for update to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
for insert to authenticated
with check (auth.uid() = auth_user_id);

drop policy if exists campaigns_user_insert on public.campaigns;
create policy campaigns_user_insert on public.campaigns
for insert to authenticated
with check (
  is_user = true
  and exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists campaigns_user_update on public.campaigns;
create policy campaigns_user_update on public.campaigns
for update to authenticated
using (
  is_user = true
  and exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
)
with check (
  is_user = true
  and exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists campaigns_user_delete on public.campaigns;
create policy campaigns_user_delete on public.campaigns
for delete to authenticated
using (
  is_user = true
  and exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists favourites_select_own on public.favourite_campaigns;
create policy favourites_select_own on public.favourite_campaigns
for select to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists favourites_insert_own on public.favourite_campaigns;
create policy favourites_insert_own on public.favourite_campaigns
for insert to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists favourites_delete_own on public.favourite_campaigns;
create policy favourites_delete_own on public.favourite_campaigns
for delete to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists donations_select_own on public.donations;
create policy donations_select_own on public.donations
for select to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists donations_insert_own on public.donations;
create policy donations_insert_own on public.donations
for insert to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists notifications_select_user on public.notifications;
create policy notifications_select_user on public.notifications
for select to authenticated
using (
  recipient = 'User'
  and exists (
    select 1
    from public.users u
    where u.id = recipient_user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists notifications_update_user on public.notifications;
create policy notifications_update_user on public.notifications
for update to authenticated
using (
  recipient = 'User'
  and exists (
    select 1
    from public.users u
    where u.id = recipient_user_id
      and u.auth_user_id = auth.uid()
  )
)
with check (
  recipient = 'User'
  and exists (
    select 1
    from public.users u
    where u.id = recipient_user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists devices_select_own on public.user_notification_devices;
create policy devices_select_own on public.user_notification_devices
for select to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists devices_insert_own on public.user_notification_devices;
create policy devices_insert_own on public.user_notification_devices
for insert to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists devices_update_own on public.user_notification_devices;
create policy devices_update_own on public.user_notification_devices
for update to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists devices_delete_own on public.user_notification_devices;
create policy devices_delete_own on public.user_notification_devices
for delete to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

commit;
