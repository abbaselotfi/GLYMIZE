# P5-C1 Scheduling availability RC acceptance — 2026-09-03

Status: **RC implementation checkpoint PASS; availability management, patient
slot discovery, booking and payment activation remain OFF.**

## Traceability

- Branch: `feat/scheduling-availability-v1-20260903`
- Implementation commit: `360adfa`
- Pull request: [#23](https://github.com/abbaselotfi/GLYMIZE/pull/23)
- Stacked base: P5-B4 branch from PR #22
- RC Worker version: `144fa4f7-ef4f-434a-8bb5-7bf71c7a7d77`
- RC Worker URL: `https://glymize-rc-portal-staging.abbaselotfi.workers.dev`

## Roadmap scope accepted

- One independently versioned scheduling policy exists per physician/practice.
- Confirmation policy is configurable as `auto_confirm` or
  `approval_required`; it is not hard-coded platform-wide.
- Recurring weekday windows use minute-of-day values and a validated IANA time
  zone, with effective date bounds.
- Date-specific whole-day or partial unavailable/leave exceptions and
  additional-availability exceptions are supported.
- Policy includes visit duration, before/after buffers, maximum daily capacity,
  booking horizon, minimum notice and cancellation/reschedule notice.
- Only the same-practice physician with currently verified IRIMC authority can
  manage the configuration; assistant delegation remains deferred.
- Rules are retired and exceptions revoked without hard-deleting history.
- Scheduling events are append-only and significant policy/publication actions
  are also recorded in the platform audit log.
- No displayed/client time becomes a reservation or authorization grant.

## RC database and runtime evidence

Migration `0014_scheduling_availability_foundation.sql` was applied only to the
isolated RC D1 database. Wrangler reports no pending migration. Post-migration
evidence:

- scheduling policies: `0`
- availability rules: `0`
- availability exceptions: `0`
- scheduling events: `0`
- `PRAGMA foreign_key_check`: no violations

The deployed RC Worker reports:

```json
{
  "schedulingAvailability": false,
  "availabilityManagement": false,
  "patientSlotDiscovery": false,
  "booking": false,
  "paymentGateway": false
}
```

The protected management endpoint fails closed with
`403 scheduling_availability_disabled`. Allowed-origin CORS preflight returns
`204` with an empty body.

## Automated and local runtime evidence

- Repository typecheck: PASS (`7/7` tasks)
- Production build: PASS (`5/5` tasks, `32` static routes)
- Admin Worker tests: PASS (`24` files, `170` tests)
- Clinical Engine tests: PASS (`23` files, `196` tests)
- Targeted scheduling foundation tests: PASS (`7/7`)
- Complete clean local D1 migration chain through `0014`: PASS
- Local D1 foreign-key check: PASS
- Policy/rule/leave creation and explicit publication: PASS
- Policy revision progression and append-only events: PASS
- Missing explicit confirmation: PASS (`400`)
- Cross-practice rule mutation denial: PASS (`404`)
- Rule retirement and exception revocation history: PASS
- Other-practice rule non-disclosure: PASS
- Appointment table deliberately absent: PASS
- Diff and TODO checks: PASS
- GitHub Actions runtime validation: pending final documentation commit

## Isolation and remaining release gates

- `main` was not changed or merged.
- Production Worker, D1, Pages, configuration and data were not changed.
- No scheduling row was inserted in RC; only additive schema was applied.
- `SCHEDULING_AVAILABILITY_ENABLED=false` remains server-authoritative in RC.
- Patient slot discovery, booking and payment capabilities are hard-coded false.
- No Pages deployment was needed because P5-C1 adds service/contracts/clients
  but no user-facing scheduling route.
- PR #23 is intentionally stacked on PR #22 and must not merge ahead of its
  dependency chain.
- Review, dependency ordering and a separate activation decision remain gates
  before any production change.

The next Roadmap task is P5-C2: implement server-authoritative candidate-slot
calculation and transactional slot locking, while booking remains OFF.
