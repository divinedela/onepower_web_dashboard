-- Run with service-role privileges.
-- Matches by normalized email and links app rows to auth.users.id.

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
