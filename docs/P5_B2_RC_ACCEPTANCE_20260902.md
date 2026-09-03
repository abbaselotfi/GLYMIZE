# P5-B2 Referral Service RC acceptance — 2026-09-02

Status: **RC implementation checkpoint PASS; Referral Service activation remains OFF.**

## Traceability

- Branch: `feat/referral-service-v1-20260902`
- Implementation commit: `b46f20e`
- Pull request: [#20](https://github.com/abbaselotfi/GLYMIZE/pull/20)
- Stacked base: P5-B1 branch from PR #19
- RC Worker version: `a4f5d125-c75f-4fc4-b757-b0a2acbdfca9`
- RC Worker URL: `https://glymize-rc-portal-staging.abbaselotfi.workers.dev`

## Roadmap scope accepted

- Referral credentials are practice-scoped, versioned, high entropy, expiring,
  revocable and explicitly bounded to 1–100 unique patient accounts.
- D1 stores only a keyed HMAC-SHA-256 lookup hash and short hint. Plaintext is
  returned exactly once and is absent from audit records and management lists.
- Issuance requires a physician or specifically authorized assistant and an
  active, verified, published intended physician.
- QR payload uses a URL fragment so the credential is absent from the initial
  HTTP request path and referrer.
- Inspection returns only a patient-safe provider snapshot and collapses
  invalid, unknown, expired, revoked and exhausted states to one response.
- Redemption requires an active global patient-account session and explicit
  confirmation. Rejected proofing is denied.
- Redemption is idempotent and capacity-safe under concurrent use. It creates
  only `pending_care_relationship` provenance, never a clinical-data grant.
- `patient_registry` remains the authoritative practice-local patient record
  and is not read, written or linked by the Referral Service.

## RC database and runtime evidence

Migration `0012_referral_service_foundation.sql` was applied only to the
isolated RC D1 database. Wrangler reports no pending migration. Post-migration
evidence:

- referral invites: `0`
- referral redemptions: `0`
- `PRAGMA foreign_key_check`: no violations

The deployed RC Worker reports:

```json
{
  "referralService": false,
  "patientRedemption": false
}
```

The global platform capability also reports `referralService=false`. A referral
management request fails closed with `403 referral_service_disabled`. Allowed
origin CORS preflight returns `204` with an empty body.

## Automated and local runtime evidence

- Repository typecheck: PASS (`7/7` tasks)
- Production build: PASS (`5/5` tasks, `32` static routes)
- Admin Worker tests: PASS (`21` files, `146` tests)
- Clinical Engine tests: PASS (`23` files, `196` tests)
- Complete local D1 migration chain `0001` through `0012`: PASS
- Local D1 foreign-key check: PASS
- Local issue/inspect/redeem/retry/exhaust/revoke flow: PASS
- Two-patient concurrent redemption at capacity one: PASS (`201`, `404`, one
  stored redemption and `use_count=1`)
- Explicit-confirmation runtime gate: PASS (missing confirmation `400`,
  confirmed redemption `201`)
- Audit/security-event verification: PASS
- Diff and secret-pattern checks: PASS
- GitHub Actions runtime validation: PASS
  ([run `33657054724`](https://github.com/abbaselotfi/GLYMIZE/actions/runs/33657054724))

## Isolation and remaining release gates

- `main` was not changed or merged.
- Production Worker, D1, Pages, configuration and data were not changed.
- No RC referral data was inserted; only the additive schema was applied.
- `REFERRAL_SERVICE_ENABLED=false` remains server-authoritative in RC.
- Referral lookup secrets remain unset in RC while the feature is disabled.
- No Pages deployment was needed because P5-B2 adds service/contracts/clients
  but no user-facing referral route.
- PR #20 is intentionally stacked on PR #19 and must not merge ahead of its
  dependency.
- Review, dependency ordering and a separate activation decision remain gates
  before any production migration or public enablement.

The next Roadmap task is P5-B3: define and implement the explicit
`CareRelationshipService` lifecycle from immutable referral redemption
provenance, without treating discovery or code possession as authorization.
