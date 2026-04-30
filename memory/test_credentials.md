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

## Notes
- Auth uses bcryptjs (see `/app/app/api/[[...path]]/route.js`).
- Fallback: if a user has no `passwordHash`, the backend accepts the literal password `wooleen2025`.
- Token is base64 `userId:role:timestamp`.
