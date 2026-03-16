# Supabase Env Migration Guide (Web/API)

## 1) Start from template
```bash
cp .env.example .env
```

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
