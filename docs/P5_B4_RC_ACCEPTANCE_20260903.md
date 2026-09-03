# P5-B4 Multi-practice patient context RC acceptance — 2026-09-03

Status: **RC implementation checkpoint PASS; multi-practice context activation
and all clinical-access grants remain OFF.**

## Traceability

- Branch: `feat/multi-practice-patient-v1-20260902`
- Implementation commit: `0d8e60c`
- Pull request: [#22](https://github.com/abbaselotfi/GLYMIZE/pull/22)
- Stacked base: P5-B3 branch from PR #21
- RC Worker version: `9dca286c-645d-4cc2-aa08-0e927396971e`
- RC Worker URL: `https://glymize-rc-portal-staging.abbaselotfi.workers.dev`

## Roadmap scope accepted

- One authenticated global patient account can read its independently scoped
  practice relationships through a bounded patient-safe context projection.
- Context rows expose safe practice/provider snapshots and relationship state,
  but never local patient IDs, Portal user IDs, patient identifiers or clinical
  data.
- Terminal relationships remain visible as history but cannot be selected.
- Selection requires explicit patient confirmation, rechecks ownership and
  state server-side, is rate-limited and records a patient security event.
- Browser context state stores only a care-relationship UUID in
  `sessionStorage`; it is a view preference and not an authorization token.
- An optional legacy Portal bridge is reported only for an exact verified
  active account/practice/local-record bridge and active relationship.
- Every response hard-codes `grantsClinicalAccess=false` and
  `grantsCrossPracticeAccess=false`.
- `patient_registry` remains authoritative and practice-local. No row is moved,
  merged, cloned or globally owned by this feature.

## RC database and runtime evidence

P5-B4 requires no schema migration. The isolated RC D1 database remains at the
existing migration chain through `0013`; Wrangler reports no pending migration.
No RC row was inserted, changed or deleted for this acceptance.

The deployed RC Worker reports:

```json
{
  "multiPracticePatient": false,
  "contextSelectionGrantsAccess": false
}
```

The protected context-list endpoint fails closed with
`403 multi_practice_patient_disabled`. Allowed-origin CORS preflight returns
`204` with an empty body.

## Automated and local runtime evidence

- Repository typecheck: PASS (`7/7` tasks)
- Production build: PASS (`5/5` tasks, `32` static routes)
- Admin Worker tests: PASS (`23` files, `163` tests)
- Clinical Engine tests: PASS (`23` files, `196` tests)
- Targeted multi-practice contract/service tests: PASS (`8/8`)
- Complete local D1 migration chain through `0013`: PASS
- Local D1 foreign-key check: PASS
- Two-practice patient-safe context projection: PASS
- Explicit-confirmation and active-context selection: PASS
- Terminal-context rejection: PASS (`409`)
- Cross-patient context denial: PASS (`404`)
- Clinical and cross-practice grants remain false: PASS
- Legacy bridge remains unavailable while record-linking is OFF: PASS
- Diff, TODO and secret-pattern checks: PASS
- GitHub Actions runtime validation: PASS
  ([run `33698527551`](https://github.com/abbaselotfi/GLYMIZE/actions/runs/33698527551))

## Isolation and remaining release gates

- `main` was not changed or merged.
- Production Worker, D1, Pages, configuration and data were not changed.
- No migration was created or applied for P5-B4.
- `MULTI_PRACTICE_PATIENT_ENABLED=false` remains server-authoritative in RC.
- Patient Identity, record linking, provider directory, referrals and care
  relationships also remain OFF in RC.
- No Pages deployment was needed because P5-B4 adds service/contracts/clients
  but no user-facing route.
- PR #22 is intentionally stacked on PR #21 and must not merge ahead of its
  dependency chain.
- Review, dependency ordering and a separate activation/authorization decision
  remain gates before any production change.

The next Roadmap task is P5-C1: define and implement the scheduling-core
availability, exception and configurable booking-policy boundary, keeping
booking/payment activation OFF.
