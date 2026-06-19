# Test Credentials - WookoPRO

## Admin Account
- **URL**: `/secure-wooleen-admin/login`
- **Phone**: `+221700000001`
- **Password**: `Serignebabacarsy1`
- **Role**: ADMIN

## Provider Accounts (all password `wooleen2025` lowercase)
- `+221700000030` — PLOMBERIE (existing provider)
- `+221700000101` — Mamadou Plomberie (Plombier, Dakar)
- `+221700000102` — Samba Électricité (Électricien, Dakar)
- `+221700000103` — Thiès Froid Service (Climatisation, Thiès)
- `+221700000104` — Ibrahima Menuiserie (Menuisier, Dakar)
- `+221700000105` — Fatou Nettoyage Pro (Nettoyage, Dakar)

## Notes
- Seed (`POST /api/seed`) ne réinitialise PAS les mdp existants.
- Pour réinitialiser : script direct via bcrypt + tokenVersion=0.
- L'endpoint `/api/bootstrap-admin` a été retiré.
- Auth : bcrypt + JWT signé (tokenVersion check pour invalider les sessions).
