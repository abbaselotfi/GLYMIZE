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

## P5-A2 auth hardening rollout

Migration `0006_refresh_token_families.sql` is additive. It must be applied before
deploying Worker code that writes `family_id` and `parent_token_id`. Validate this
sequence against the RC/staging D1 first; never edit migrations `0001` through
`0005` in place.

1. Back up and inspect the target migration list.
2. Apply migration `0006` to RC/staging D1.
3. Deploy the matching Worker build to RC/staging.
4. Verify login, refresh rotation, replay-family revocation, logout and password
   rotation before repeating the gate for production.

Auth access-token encryption can be separated from `SESSION_SECRET` without
invalidating existing 20-minute access tokens:

- `AUTH_TOKEN_SECRET`: current sealing key; new tokens use this when present.
- `AUTH_TOKEN_SECRET_PREVIOUS`: optional previous auth-token key during rotation.
- `AUTH_TOKEN_ALLOW_LEGACY_SESSION_SECRET`: defaults to `true`; set to `false`
  only after the legacy access-token lifetime has elapsed and verification is
  clean.

Treat both auth-token keys as Worker secrets. Generate them with a CSPRNG and set
them with `wrangler secret put`; never store their values in Wrangler config,
logs, shell history, documentation or source control. The safe rotation order is
current key -> deploy/verify -> move it to previous while installing the next
current key -> wait for the access-token lifetime -> remove previous. Remote
migration, secret changes and deployment remain separate explicit release gates.

## P5-A Patient Identity v2 release gate

Migrations `0007_global_patient_identity_v2.sql`,
`0008_reviewed_patient_legacy_links.sql` and
`0009_portal_session_auth_source.sql` are additive. Migration
`0010_patient_sms_otp_schema.sql` adds provider-neutral OTP persistence only.
Apply them in order to
RC/staging before deploying the matching Worker. Do not rewrite either
migration after it has reached a shared D1 database.

The following runtime variables are independent and fail closed:

- `PATIENT_IDENTITY_V2_ENABLED`: master Patient Identity v2 route gate.
- `PATIENT_SELF_REGISTRATION_ENABLED`: public account-creation gate.
- `PATIENT_RECORD_LINKING_ENABLED`: reviewed legacy-link mutation gate.
- `PATIENT_SMS_OTP_ENABLED`: capability declaration only; keep `false` until an
  approved provider and complete server-side OTP flow exist.

Keep all four variables `false` during schema/code rollout. A verified legacy
link requires a practice-scoped request, an explicit physician/admin decision,
an approved verification method and an audit event. It never creates a
`care_relationship`, changes `patient_registry`, or merges practice records.
An exchanged Portal session records `auth_source='patient_identity'`; refresh
rotation preserves that source and link revocation atomically revokes all such
Portal sessions.

Migration `0010` does not enable SMS delivery or login. It stores only keyed
destination lookup and hashed code material, has bounded attempts/expiry, and
must be deployed while `PATIENT_SMS_OTP_ENABLED=false`.

## Phase 0 / Task 6 patient-access RBAC rollout

Migration `0018_patient_access_rbac.sql` adds practice-scoped `editor` and
`approver` assignments for patient-adjacent routes. Apply it before deploying
the matching Worker code. The migration seeds active physicians as approvers
and active assistants as editors, then keeps future membership changes in sync
with database triggers. A missing or inactive assignment fails closed.

Validate migration and role behavior against a local or RC/staging D1 first.
Do not apply this migration remotely as part of ordinary development or CI;
remote migration and Worker deployment remain separate release gates. The full
authorization boundary and temporary catalogue exception are documented in
[`docs/architecture/PATIENT_ACCESS_RBAC.md`](../../docs/architecture/PATIENT_ACCESS_RBAC.md).
