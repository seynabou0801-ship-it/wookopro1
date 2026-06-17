# Test Credentials - WookoPRO

## Admin Account
- **URL**: `/secure-wooleen-admin/login`
- **Phone**: `+221700000001`
- **Password**: `wooleen2025`
- **Role**: ADMIN

## Provider Accounts (all password `wooleen2025`)
- `+221700000030` — PLOMBERIE (existing provider)
- `+221700000101` — Mamadou Plomberie (Plombier, Dakar)
- `+221700000102` — Samba Électricité (Électricien, Dakar)
- `+221700000103` — Thiès Froid Service (Climatisation, Thiès)
- `+221700000104` — Ibrahima Menuiserie (Menuisier, Dakar)
- `+221700000105` — Fatou Nettoyage Pro (Nettoyage, Dakar)

## Seed Endpoint
`POST /api/seed` — idempotent (safe to re-run). Seeds admin + 5 providers + categories.
⚠️ The seed endpoint does NOT reset existing user passwords (intentional). To restore passwords,
run a small node script that updates `passwordHash` directly via bcrypt + sets `tokenVersion=0`.

## Auth Architecture (after Lot 2 — Password UX)
- Auth uses bcryptjs + jsonwebtoken (signed JWT).
- JWT payload : `{ sub, role, tv }` where `tv` = `user.tokenVersion`.
- `getAuthUser()` rejects tokens whose `tv` does not match the user's current `tokenVersion`.
  This is how session invalidation works after a password reset / change.
- The literal-`wooleen2025` fallback was removed in Lot 1 — every account must have a `passwordHash`.

## Password Endpoints (Lot 2)
- `POST /api/auth/forgot-password` — body: `{ phone, role }`. Creates PASSWORD_RESET_REQUEST notification.
- `POST /api/admin/notifications/:id/reset-password` — admin auth. Generates temp password, increments `tokenVersion`.
- `POST /api/auth/change-password` — user auth. Body: `{ currentPassword, newPassword }`. Returns new token.
