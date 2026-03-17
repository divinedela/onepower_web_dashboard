begin;

-- Remove legacy password_hash columns; Supabase Auth is the sole password authority.
alter table public.users
  drop column if exists password_hash;

alter table public.admin_logins
  drop column if exists password_hash;

commit;
