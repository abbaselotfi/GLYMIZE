# P5-C3 Appointment booking and lifecycle RC acceptance — 2026-09-03

Status: **RC implementation checkpoint PASS; slot discovery, slot locking,
booking, appointments and payments remain OFF.**

## Traceability

- Branch: `feat/scheduling-appointments-v1-20260903`
- Implementation commit: `97595d5`
- Policy/audit hardening commit: `fe038a1`
- Pull request: pending — based on `main` after the P5-C2 merge (`4fac82b`, PR #24)
- RC Worker version: `ee9d9d4e-4a3b-4909-8f2e-9b87cd7a03e7`
- RC Worker URL: `https://glymize-rc-portal-staging.abbaselotfi.workers.dev`

## Roadmap scope accepted

- Booking converts a server-owned, unexpired `held` slot hold into a canonical
  appointment; the hold must still point at an active care relationship, a
  published scheduling policy and the same practice/physician.
- The booking transaction inserts the appointment before consuming the hold;
  a unique hold reference, the exact-start partial unique index and the
  interval-overlap guard are independent collision backstops.
- Candidate-slot generation subtracts both live holds and active appointments.
- `auto_confirm` creates `confirmed`; `approval_required` creates `requested`
  and physician-side confirmation is a separate auditable transition.
- The eight canonical lifecycle states are `requested`, `confirmed`,
  `cancelled`, `rescheduled`, `checked_in`, `in_progress`, `completed` and
  `no_show`, guarded by optimistic `version` checks and an append-only
  `appointment_events` ledger.
- Patient cancellation/reschedule use server time and the policy's captured
  notice-window snapshots; later policy edits do not rewrite an appointment's
  terms. Reschedule consumes a new hold, marks the former appointment
  `rescheduled` and atomically links the successor.
- Starting and completing care require the assigned physician; assistants need
  the explicit `appointments.manage` permission and cannot start or complete an
  encounter.
- Every booking receives one immutable provider-neutral financial snapshot
  (`paymentRequired=false` / `not_required` only); database triggers abort any
  update or delete of historical snapshot terms. No gateway identifier, card
  data or payment intent is stored.
- Patient changes append patient security events; runtime-user changes append
- Appointment events are database-enforced append-only; reschedule state and
  its patient/practice audit evidence commit in the same D1 batch.

## RC database evidence

Migrations `0016_appointment_lifecycle.sql` and
`0017_appointment_policy_snapshot_guards.sql` were applied only to the isolated
RC D1 database (`glymize-runtime-rc`). Wrangler reports no pending migration.
Post-migration evidence:

- appointments: `0`
- appointment participants: `0`
- appointment financial snapshots: `0`
- appointment events: `0`
- `PRAGMA foreign_key_check`: no violations

## RC runtime evidence

The deployed RC Worker reports:

```json
{
  "schedulingAvailability": false,
  "schedulingSlotDiscovery": false,
  "schedulingSlotLocking": false,
  "schedulingBooking": false,
  "paymentGateway": false
}
```

`/v1/scheduling/capabilities` reports every capability false with the
hard-coded `paymentGateway: false`. The appointment endpoints fail closed with
`403 scheduling_booking_disabled`. Allowed-origin CORS preflight returns `204`
with an empty body.

## Automated and local runtime evidence

- Repository typecheck: PASS (`7/7` turbo tasks)
- Repository tests: PASS (`4/4` turbo tasks)
- Production build: PASS (`5/5` turbo tasks, `32` static routes)
- GitHub Actions runtime validation: PASS
  ([run `33730107831`](https://github.com/abbaselotfi/GLYMIZE/actions/runs/33730107831))
- Admin Worker tests: PASS (`26` files, `187` tests, including
  `appointment-lifecycle.test.ts` with `9` tests)
- Clinical Engine tests: PASS (`23` files, `196` tests)
- Clean local D1 migration chain through `0017`: PASS (`17/17` applied in a
  fresh persistence directory); local `PRAGMA foreign_key_check`: no violations
- Seeded local end-to-end smoke (capabilities → concurrent double-booking →
  slot visibility → reschedule → physician start → complete): PASS
  - concurrent booking of one hold returned exactly one `201` and one
    `409 slot_hold_not_bookable`
  - the booked start time disappeared from candidate slots
  - reschedule returned `201 confirmed` with `rescheduledFromAppointmentId`
    linking the former appointment and a freshly captured snapshot
  - physician start returned `in_progress` (`version` 2); complete returned
    `completed` (`version` 3)
  - final state: `2` appointments, `4` participants, `2` snapshots,
    `5` lifecycle events (`confirmed`, `rescheduled`, `confirmed`, `started`,
    `completed` with the correct actor types), both holds `consumed`
- Financial-snapshot immutability triggers: UPDATE and DELETE both aborted with
  `appointment_financial_snapshot_immutable`
- Appointment-event immutability trigger: DELETE aborted with
  `appointment_event_immutable`
- Booking policy snapshot: changing the live policy notice values to
  `1440`/`2880` did not alter either appointment's captured `0`/`0` terms
- Booking disabled by default: appointment routes fail closed with
  `403 scheduling_booking_disabled` without `SCHEDULING_BOOKING_ENABLED`
- Allowed-origin CORS preflight: `204` with an empty body

The scheduling flags were enabled only inside the throwaway local smoke
environment; RC and production scheduling capabilities remained false
throughout.

## Isolation and remaining release gates

- `main` was not changed or merged; production Worker, D1, Pages,
  configuration and data were not changed.
- Only additive schema was applied to the isolated RC D1 database; no
  appointment row exists in RC.
- All scheduling flags remain false in RC; booking, appointment lifecycle,
  notifications, live video and clinical grants derived solely from
  appointments remain absent by design.
- No Pages deployment was needed because P5-C3 adds service/contracts/clients
  and no user-facing scheduling route.
- Review, CI on the stacked pull request, dependency ordering and separate
  activation decisions remain gates before any production change.

P5-D remains the next Patient Care Hub workstream. Per the current owner
direction, the newly supplied engineering-hygiene and clinical-convergence
workstreams must first be reconciled into the canonical Roadmap and then
executed as separate, ordered PRs.
