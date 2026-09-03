# P5-C3 appointment lifecycle design

Status: implementation candidate; all scheduling activation remains OFF by default.

## Boundary

P5-C3 turns a valid, server-owned slot hold into a canonical appointment. It
does not activate payments, notifications, live consultation or clinical-record
authorization. `patient_accounts` remains the global identity boundary and
`patient_registry` remains the authoritative practice-local clinical record.

## Booking invariant

An appointment can be created only from an unexpired `held` row owned by the
authenticated, verified patient. The hold must still point to an active care
relationship, a published scheduling policy and the same practice/physician.
The transaction inserts the appointment before consuming the hold; all later
statements are conditional on that insert. A unique hold reference, an active
exact-start index and an interval-overlap guard provide independent collision
backstops.

Candidate generation now subtracts both live holds and active appointments.
Displayed availability remains informational until the booking transaction
returns success.

Cloudflare documents `D1Database.batch()` as a transaction whose statements run
sequentially and roll back as a unit if a statement fails. D1 also processes
queries on a database one at a time. These guarantees support the conditional
insert/update design, while database constraints remain the final backstop:

- <https://developers.cloudflare.com/d1/worker-api/d1-database/#batch>
- <https://developers.cloudflare.com/d1/best-practices/query-d1/>

## Confirmation and lifecycle

The scheduling policy is snapshotted at booking:

- `auto_confirm` creates `confirmed`;
- `approval_required` creates `requested` and requires an assigned physician or
  explicitly permitted assistant to confirm.

Supported canonical states are `requested`, `confirmed`, `cancelled`,
`rescheduled`, `checked_in`, `in_progress`, `completed` and `no_show`.
Optimistic `version` checks reject stale transitions. Every successful state
change appends an `appointment_events` row; runtime-user changes also append to
the practice audit log, while patient changes append a patient security event.
Database triggers reject update or deletion of lifecycle event rows.

Patient cancellation and rescheduling use server time and booking-time snapshots
of the policy's notice rules, so later policy edits cannot rewrite an existing
appointment's terms. A reschedule consumes a new hold, marks the former appointment
`rescheduled`, creates a linked successor, and records both sides atomically.
Starting and completing care require the assigned physician. Assistants need
the explicit `appointments.manage` permission and cannot start or complete a
clinical encounter.

## Financial snapshot

Every booking receives one provider-neutral financial snapshot. In P5-C3 the
only generated state is `paymentRequired=false` / `not_required`, because no
pricing policy or payment provider is active. Database triggers prevent update
or deletion of historical snapshot terms. Rescheduling copies the terms into a
new snapshot captured for the successor appointment.

No gateway identifier, raw card data, payment intent or payment event is stored.
A future PaymentGateway adapter must use separate intent/event tables and must
not rewrite the appointment's booking-time terms.

## Activation gates

`SCHEDULING_BOOKING_ENABLED` is additive and depends on all previous gates:
availability, public directory, slot discovery, slot locking, patient identity
and care relationships. It defaults to OFF. Production activation, migrations
and data changes require a separate release decision.
