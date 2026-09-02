# P5-A3 — Global Patient Identity v2

Status: implementation contract for additive schema; runtime activation remains OFF.

## Scope

This checkpoint creates the canonical identity substrate required by P5-A. It
does not implement provider discovery, referrals, `care_relationships`,
scheduling, SMS delivery or production self-registration.

The normative ownership boundary is:

```text
patient_account (global identity/authentication)
  -> verified legacy/link bridge (migration only)
  -> portal_user (current practice portal identity)
  -> patient_registry (authoritative practice-local clinical record)
```

The bridge does not itself grant access to a clinical record. Runtime
authorization must continue to resolve an active, explicitly verified link and
the practice-local portal/record policy. P5-B will introduce the durable
`care_relationship` domain rather than overloading this migration bridge.

## Decisions

1. `patient_accounts` has no `practice_id` or `patient_id`.
2. National ID is an identifier, never an authentication secret.
3. Normalized identity values use a keyed HMAC lookup and encrypted authorized
   representation; plaintext values are forbidden.
4. One normalized national ID resolves to at most one active canonical account.
   Duplicate/recovery cases must enter an explicit reviewed workflow, never an
   automatic clinical-record merge.
5. Account creation and clinical-record linking are separate operations.
   Self-created accounts begin `unverified` and unlinked.
6. Password credentials use the existing versioned hardened credential
   mechanism and retain lifecycle timestamps.
7. Patient sessions have independent token-family/replay-containment metadata.
8. SMS identity/capability is schema-ready but delivery and OTP login remain
   OFF until provider and admin gates are explicitly approved.
9. Legacy `portal_users` remains authoritative for the current portal during
   migration. No row is rewritten or deleted by `0007`.
10. `patient_registry` remains the authoritative practice-local clinical file
    and is not altered by this checkpoint.

## Canonical states

- Account: `active`, `disabled`, `closed`
- Identity verification: `unverified`, `pending`, `verified`, `rejected`
- Legacy bridge: `pending`, `verified`, `rejected`, `revoked`
- Session compromise is represented by `compromised_at` and family revocation.

## Linking invariants

- Knowing a national ID cannot discover or link an existing clinical record.
- A bridge becomes `verified` only through a separately authorized flow.
- Verification records provenance, verifier where applicable, and timestamp.
- One legacy `portal_user` maps to at most one canonical account.
- One canonical account may map to multiple legacy portal identities because
  current portal identities are practice-bound.
- A verified bridge must never merge two `patient_registry` rows.

## Rollout gates

1. Review and test migration `0007` locally/RC.
2. Apply it to RC D1 without enabling any new public route.
3. Implement `PatientIdentityService` behind an OFF-by-default capability.
4. Add generic-error, account/IP rate-limit, credential, session and audit tests.
5. Apply additive migration `0008` and add reviewed legacy linking; do not
   bulk-link solely by identifier equality.
6. Keep `PATIENT_RECORD_LINKING_ENABLED` independently OFF during rollout.
7. Apply additive migration `0009` before enabling verified-link Portal session
   exchange; preserve the auth source across refresh and revoke those sessions
   atomically when the link is revoked.
8. Apply provider-neutral OTP schema migration `0010` with SMS delivery and
   runtime routes still absent and `PATIENT_SMS_OTP_ENABLED=false`.
9. Complete RC security/manual acceptance before any production migration.

## Acceptance criteria

- Schema contains no practice ownership on canonical accounts.
- No plaintext national ID/mobile column exists.
- No FK from canonical accounts directly to `patient_registry` exists.
- Existing Portal v1 and Patient Record v2 tables remain untouched.
- Migration is additive and contains no `DROP`, destructive update or automatic
  legacy-link population.
- SMS and self-registration capabilities remain disabled after schema rollout.
- Legacy-link mutations remain disabled until the independent record-linking
  gate is enabled; reads never bypass patient or practice authorization.

## Security references

- NIST SP 800-63-4 separates subscriber accounts, identity proofing and
  authenticator binding.
- OWASP Authentication guidance requires generic authentication responses to
  prevent account enumeration.
- OWASP privacy guidance requires strong cryptography for stored identity data
  and credentials.
