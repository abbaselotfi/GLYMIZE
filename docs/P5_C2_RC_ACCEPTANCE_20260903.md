# P5-C2 Candidate slots and transactional holds RC acceptance — 2026-09-03

Status: **RC implementation checkpoint PASS; slot discovery, slot locking,
booking, appointments and payments remain OFF.**

## Traceability

- Branch: `feat/scheduling-slot-locks-v1-20260903`
- Implementation commit: `6a606f3`
- Pull request: [#24](https://github.com/abbaselotfi/GLYMIZE/pull/24)
- Stacked base: P5-C1 branch from PR #23
- RC Worker version: `266a4224-ae89-4c53-916d-da91e66884ff`
- RC Worker URL: `https://glymize-rc-portal-staging.abbaselotfi.workers.dev`

## Roadmap scope accepted

- Published schedules produce bounded server-authoritative candidate slots.
- Calculation applies IANA timezone conversion, effective recurring rules,
  additional availability, unavailable/leave exceptions, duration, buffers,
  capacity, horizon and minimum notice.
- Candidate responses are informational and never claim a reservation.
- A five-minute hold requires a verified authenticated patient and an active
  care relationship assigned to the exact schedule physician/practice.
- Hold acquisition revalidates the candidate immediately before its write.
- Expiry cleanup, interval-overlap guard, insert and event writes execute in one
  D1 transaction; an exact-start partial unique index is a second backstop.
- Internal lock intervals include before/after buffers and remain private.
- Hold list/release operations are patient-account scoped and require explicit
  confirmation for release.
- Hold and patient security events are append-only.
- A hold hard-codes `bookingCreated=false` and `grantsClinicalAccess=false`.

## RC database and runtime evidence

Migration `0015_scheduling_slot_holds.sql` was applied only to the isolated RC
D1 database. Wrangler reports no pending migration. Post-migration evidence:

- appointment slot holds: `0`
- appointment slot hold events: `0`
- `PRAGMA foreign_key_check`: no violations

The deployed RC Worker reports:

```json
{
  "schedulingAvailability": false,
  "schedulingSlotDiscovery": false,
  "schedulingSlotLocking": false,
  "booking": false,
  "paymentGateway": false
}
```

The discovery and locking endpoints fail closed with
`403 scheduling_slot_discovery_disabled` and
`403 scheduling_slot_locking_disabled`. Allowed-origin CORS preflight returns
`204` with an empty body. Repeated capability probes confirmed the complete
flag-off response after normal Worker-version propagation.

## Automated and local runtime evidence

- Repository typecheck: PASS (`7/7` tasks)
- Production build: PASS (`5/5` tasks, `32` static routes)
- Admin Worker tests: PASS (`25` files, `178` tests)
- Clinical Engine tests: PASS (`23` files, `196` tests)
- Targeted scheduling availability/slot tests: PASS (`2` files, `15` tests)
- Complete clean local D1 migration chain through `0015`: PASS
- Local D1 foreign-key check: PASS
- Tehran timezone conversion and partial-leave filtering: PASS (`4` expected slots)
- Two-patient same-slot contention: PASS (one `201`, one `409`)
- Held slot removal and release restoration: PASS (`4 → 3 → 4`)
- Non-owner hold list isolation: PASS (`0` rows)
- Non-owner release denial: PASS (`409`)
- Acquired/released hold and patient security events: PASS
- Appointment table deliberately absent: PASS
- Diff and TODO checks: PASS
- GitHub Actions runtime validation: PASS
  ([run `33701667351`](https://github.com/abbaselotfi/GLYMIZE/actions/runs/33701667351))

## Isolation and remaining release gates

- `main` was not changed or merged.
- Production Worker, D1, Pages, configuration and data were not changed.
- No slot-hold row was inserted in RC; only additive schema was applied.
- Availability, slot discovery and slot locking flags remain false in RC.
- Booking, appointment lifecycle, clinical grants and payment capabilities are
  hard-coded false.
- No Pages deployment was needed because P5-C2 adds service/contracts/clients
  but no user-facing scheduling route.
- PR #24 is intentionally stacked on PR #23 and must not merge ahead of its
  dependency chain.
- Review, dependency ordering and separate activation decisions remain gates
  before any production change.

The next Roadmap task is P5-C3: implement booking, reschedule and cancellation
with the auditable appointment lifecycle and immutable financial snapshot,
while payment gateway activation remains OFF.
