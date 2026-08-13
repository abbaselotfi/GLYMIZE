# GLYMIZE D1 runtime database setup

Database name: `glymize-runtime`

Worker binding name: `GLYMIZE_DB`

This database stores runtime account/team metadata and encrypted handoff rows. Patient identifiers are stored only as HMAC values; clinical payloads are additionally encrypted by GLYMIZE with AES-256-GCM before D1 storage.

## 1. Create D1

From `apps/admin-worker`:

```powershell
pnpm exec wrangler d1 create glymize-runtime
```

Copy only the returned `database_id`. It is not an API secret.

## 2. Bind it

Add to `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "GLYMIZE_DB",
    "database_name": "glymize-runtime",
    "database_id": "<DATABASE_ID>",
    "migrations_dir": "migrations"
  }
]
```

## 3. Create the application-layer clinical encryption secret

Never paste this secret into chat or source control.

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = [Convert]::ToBase64String($bytes)
$secret | pnpm exec wrangler secret put CLINICAL_DATA_MASTER_KEY
Remove-Variable secret,bytes
```

## 4. Apply migrations remotely

```powershell
pnpm exec wrangler d1 migrations apply glymize-runtime --remote
```

## 5. Deploy the Worker

```powershell
pnpm exec wrangler deploy
```

## 6. Initial owner account

Until the direct IRIMC adapter is configured, sign in to `/admin` with GitHub and open `/account`; the admin-only bootstrap creates the first physician runtime account. It is recorded as `admin_manual` and is not a public verification bypass.

Public physician sign-up fails closed unless `IRIMC_VERIFY_ENDPOINT` is configured to an HTTPS adapter that returns an exact Medical Council match.
