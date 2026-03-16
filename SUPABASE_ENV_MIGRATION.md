# Supabase Env Migration Guide (Web/API)

## 1) Start from template
```bash
cp .env.example .env
```

If `.env.example` is not present in your local branch, edit your existing `.env` directly and add the keys below.

## 2) Minimum values to run Paystack + current API
- `SESSION_SECRET_KEY`
- `JWT_SECRET_KEY`
- `PUBLIC_HOST`
- `PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`

## 3) Minimum values for Supabase migration
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

## 4) Suggested migration toggles
- `AUTH_PROVIDER=supabase`
- `DATA_PROVIDER=supabase`
- `STORAGE_PROVIDER=supabase`
- `PUSH_PROVIDER=firebase`

## 5) Push notifications during migration
Keep Firebase admin credentials configured while you still deliver push with FCM:
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `FIREBASE_STORAGE_BUCKET`

## 6) Paystack callback URL
Set `PUBLIC_HOST` to your API base including `/api`:
- Example: `https://api.example.com/api`

## 7) Start web API without MongoDB
- Set `DATA_PROVIDER=supabase` in `.env`.
- Keep `AUTH_PROVIDER=supabase` and `STORAGE_PROVIDER=supabase`.
- Start server: `npm start`.
- Supabase bootstrap health endpoints:
  - `GET /api/health`
  - `GET /api/migration/status`
  - `GET /api/payments/paystack/return?reference=...` (callback/deeplink bridge)
- Admin entrypoint:
  - `GET /` (login page)
- In this mode, legacy Mongo-backed admin/API endpoints are intentionally disabled until migrated to Supabase.
- `GET /api/migration/status` now includes a masked Supabase env readiness check (`missing` keys list).
- Migrated mobile auth endpoints in bootstrap mode:
  - `POST /api/checkRegisterUser`
  - `POST /api/signUp`
  - `POST /api/verifyOTP`
  - `POST /api/getUserDetails`

## 8) Admin panel behavior in Supabase mode
- Admin login/session/profile/password are available using `admin_logins` from Supabase.
- Intro module is migrated (`add-intro`, `intro`, `edit-intro`, `delete-intro`, `intro-status`).
- Dashboard renders a migration status page (`/dashboard`) instead of Mongo aggregations.
- Non-migrated admin modules still redirect back to dashboard with a warning flash message.
