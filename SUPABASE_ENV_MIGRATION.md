# Supabase Env Migration Guide (Web/API)

## 1) Start from template
```bash
cp .env.example .env
```

If `.env.example` is not present in your local branch, edit your existing `.env` directly and add the keys below.

## 2) Minimum values to run Paystack + current API
- `SESSION_SECRET_KEY`
- `PUBLIC_HOST`
- `PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`

## 3) Minimum values for Supabase migration
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_AUTH_REDIRECT_URL` (HTTPS callback URL used for verification/reset)

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
  - `POST /api/signIn`
  - `POST /api/isVerifyAccount`
  - `POST /api/resendOtp`
  - `POST /api/forgotPassword`
  - `POST /api/forgotPasswordOtpVerification`
  - `POST /api/resetPassword`
  - `POST /api/getOtp` (deprecated compatibility endpoint)
  - `POST /api/getForgotPasswordOtp` (deprecated compatibility endpoint)
  - `POST /api/uploadImage`
  - `POST /api/editUserProfile`
  - `POST /api/changePassword`
  - `POST /api/deleteAccountUser`
  - `POST /api/getUserDetails`
  - Active flow now uses Supabase-native email verification links and reset links.
  - OTP endpoints are compatibility shims and should be treated as deprecated.
  - `resetPassword` now requires authenticated reset context (Supabase access token from callback).
  - These endpoints now issue/validate Supabase Auth access tokens (instead of local JWTs).

## 8) Admin panel behavior in Supabase mode
- Admin login/session/profile/password are available using `admin_logins` + Supabase Auth access tokens.
- Intro module is migrated (`add-intro`, `intro`, `edit-intro`, `delete-intro`, `intro-status`).
- Dashboard renders a migration status page (`/dashboard`) instead of Mongo aggregations.
- Non-migrated admin modules still redirect back to dashboard with a warning flash message.
- Admin session guard validates Supabase token, mapped `admin_logins.auth_user_id`, and admin role.

## 9) Hard cutover: require re-signup for old mobile users
- Legacy mobile passwords are no longer accepted by `/api/signIn`.
- If a user exists in `public.users` but has no `auth_user_id`, they must sign up again to migrate.
- Signup now acts as the migration path for old accounts, then links `users.auth_user_id` to `auth.users.id`.

## 10) Promote a user to admin
Use the utility script from `onepower_web_dashboard`:

```bash
npm run admin:promote -- --email user@example.com
```

Optional fields:

```bash
npm run admin:promote -- --email user@example.com --name "Admin Name" --contact "+233..." --avatar "uploads/avatar.png"
```

Dry run preview:

```bash
npm run admin:promote -- --email user@example.com --dry-run
```

What it does:
- Requires an existing Supabase Auth user for that email.
- Sets `auth.users.app_metadata.role = "admin"`.
- Creates or updates `public.admin_logins` with `is_admin=1` and `auth_user_id=<auth user id>`.
