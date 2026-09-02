# P5-B3 CareRelationshipService RC acceptance — 2026-09-02

Status: **RC implementation checkpoint PASS; Care Relationships activation and clinical authorization remain OFF.**

## Traceability

- Branch: `feat/care-relationship-v1-20260902`
- Implementation commit: `66d635b`
- Pull request: [#21](https://github.com/abbaselotfi/GLYMIZE/pull/21)
- Stacked base: P5-B2 branch from PR #20
- RC Worker version: `1a9dd457-032f-40de-b328-f52ee7fc2d87`
- RC Worker URL: `https://glymize-rc-portal-staging.abbaselotfi.workers.dev`

## Roadmap scope accepted

- One global patient account may hold one independent relationship per practice.
- A request can be created only from that authenticated patient's immutable
  referral-redemption provenance and requires explicit confirmation.
- Request retries are idempotent; terminal relationships may be explicitly
  reopened without losing append-only provenance/event history.
- Only the assigned physician with currently verified IRIMC authority may
  accept/reject/pause/resume/end. Assistants cannot assume clinical authority.
- Patient proofing must be verified before a physician can activate a request.
- A patient may explicitly withdraw/revoke their requested/active/paused
  relationship.
- Optional local record linkage requires an exact, separately reviewed verified
  global-account/Portal bridge for the same practice and local patient row.
- No identifier equality, referral possession or directory discovery performs
  automatic local-record matching.
- `patient_registry` remains authoritative and practice-local; no row is moved,
  merged, cloned, globally owned or modified by this service.
- P5-B3 records lifecycle state but deliberately grants no clinical access.

## RC database and runtime evidence

Migration `0013_care_relationship_foundation.sql` was applied only to the
isolated RC D1 database. Wrangler reports no pending migration. Post-migration
evidence:

- care relationships: `0`
- relationship provenance rows: `0`
- relationship events: `0`
- `PRAGMA foreign_key_check`: no violations

The deployed RC Worker reports:

```json
{
  "careRelationships": false,
  "localRecordLinking": false,
  "clinicalAuthorization": false
}
```

The global platform capability also reports `careRelationships=false`. A
patient relationship request fails closed with `403 care_relationships_disabled`.
Allowed-origin CORS preflight returns `204` with an empty body.

## Automated and local runtime evidence

- Repository typecheck: PASS (`7/7` tasks)
- Production build: PASS (`5/5` tasks, `32` static routes)
- Admin Worker tests: PASS (`22` files, `155` tests)
- Clinical Engine tests: PASS (`23` files, `196` tests)
- Complete local D1 migration chain `0001` through `0013`: PASS
- Local D1 foreign-key check: PASS
- Request, explicit confirmation and retry idempotency: PASS
- Unverified-patient activation denial and verified activation: PASS
- Physician accept/pause/resume/end lifecycle: PASS
- Patient explicit revoke lifecycle: PASS
- Verified bridge link/unlink and fail-safe unlink: PASS
- Relationship provenance, audit and security event evidence: PASS
- Two-practice isolation: PASS (patient sees both; practice sees only its row;
  cross-practice transition returns `404`)
- Diff and secret-pattern checks: PASS
- GitHub Actions runtime validation: pending at the time of this evidence commit

## Isolation and remaining release gates

- `main` was not changed or merged.
- Production Worker, D1, Pages, configuration and data were not changed.
- No RC care-relationship data was inserted; only additive schema was applied.
- `CARE_RELATIONSHIPS_ENABLED=false` remains server-authoritative in RC.
- `PATIENT_RECORD_LINKING_ENABLED=false` remains independently OFF in RC.
- `clinicalAuthorization=false` is a hard-coded contract for this checkpoint.
- No Pages deployment was needed because P5-B3 adds service/contracts/clients
  but no user-facing relationship route.
- PR #21 is intentionally stacked on PR #20 and must not merge ahead of its
  dependency.
- Review, dependency ordering and a separate activation/authorization migration
  decision remain gates before any production change.

The next Roadmap task is P5-B4: complete the multi-practice patient-account
experience and authorization/read-model contract without merging or exposing
practice-local clinical records.
