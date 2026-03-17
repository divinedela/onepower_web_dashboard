# Supabase Schema Bootstrap

This folder contains an initial Supabase/Postgres schema generated from current Mongo models.

## Files
- `migrations/20260316_0001_initial_supabase_schema.sql`
- `migrations/20260316_0002_auth_user_id_linking.sql`
- `scripts/backfill_auth_user_id.sql`

## How to apply

### Option A: Supabase SQL Editor
1. Open Supabase project dashboard.
2. Go to SQL Editor.
3. Paste file contents and run.

### Option B: Supabase CLI
1. Save migration file in your Supabase project.
2. Run:
```bash
supabase db push
```

## Scope covered
- Auth/profile data (`users`, `admin_logins`)
- Content (`intros`, `categories`, `campaigns`, `news`, `banners`, `pages`)
- Donations/payments (`donations`, `payment_gateways`)
- User activity (`favourite_campaigns`, `notifications`, `user_notification_devices`)
- OTP/config (`otps`, `forgot_password_otps`, `verification_licenses`, `mail_settings`)
- Aggregation view (`campaign_donation_stats`)
- Baseline RLS policies for direct mobile/web client rollout

## Important migration notes
1. `users.id` remains app-row UUID; `users.auth_user_id` stores `auth.users.id`.
2. `admin_logins.auth_user_id` stores the linked admin auth user id.
3. Run `scripts/backfill_auth_user_id.sql` after importing legacy rows to map by normalized email.
4. Updated RLS ownership policies now resolve ownership through `auth_user_id`.
5. Keep backend service role usage during transition, then gradually enforce direct client + RLS paths.
6. Paystack secret keys should stay in environment variables, not in client-accessible tables.
7. Push can remain Firebase-based while token storage moves to Supabase (`user_notification_devices`).

## Next step after schema
- Build data migration scripts from MongoDB -> Supabase tables with `legacy_mongo_id` mapping.
