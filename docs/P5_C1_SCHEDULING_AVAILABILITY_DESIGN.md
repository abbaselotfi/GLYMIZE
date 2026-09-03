# P5-C1 — Scheduling availability and policy boundary

Status: additive implementation checkpoint; runtime activation remains OFF.

## Scope

P5-C1 establishes the provider-managed inputs from which a later slot service
can calculate candidate appointment times:

- one versioned scheduling policy per physician and practice;
- recurring weekday availability in an explicit IANA time zone;
- date-specific unavailable/leave and additional-availability exceptions;
- configurable `auto_confirm` or `approval_required` booking policy;
- duration, buffers, daily capacity, booking horizon, minimum notice and
  cancellation/reschedule notice settings;
- append-only scheduling events plus the existing platform audit log.

No patient-facing slot, reservation, appointment or payment operation is part
of this checkpoint.

## Authority and isolation

All management requests require a valid runtime session for the same practice,
the `physician` role and a currently verified IRIMC status. Assistant
delegation is intentionally deferred to its explicit Roadmap phase. Every
policy, rule and exception is anchored to the composite
`(practice_id, physician_user_id)` membership boundary.

User/practice hard deletion is blocked when scheduling history exists. Rows
are not reassigned across practices. Rules are retired and exceptions are
revoked rather than hard-deleted, so a configuration change cannot erase its
history.

## Time semantics

- Recurring windows use local weekday plus minute-of-day and a validated IANA
  time-zone identifier stored on the policy.
- Effective and exception dates use strict `YYYY-MM-DD` calendar values.
- A later server-side slot generator must resolve time-zone offsets for the
  requested date, apply exceptions, duration/buffers/capacity and deduplicate
  overlaps before exposing informational candidate slots.
- Client time and a displayed candidate slot can never establish a reservation.

## HTTP boundary

- `GET /v1/scheduling/capabilities`
- `GET /v1/scheduling/manage`
- `PUT /v1/scheduling/manage/policy`
- `POST /v1/scheduling/manage/rules`
- `POST /v1/scheduling/manage/rules/:id/retire`
- `POST /v1/scheduling/manage/exceptions`
- `POST /v1/scheduling/manage/exceptions/:id/revoke`
- `POST /v1/scheduling/manage/publish`
- `POST /v1/scheduling/manage/hide`

Mutations require explicit confirmation. Publication requires at least one
active availability rule. Suspended policies fail closed.

## Rollout boundary

`SCHEDULING_AVAILABILITY_ENABLED` defaults to false. Capability responses also
hard-code these future grants to false:

```json
{
  "patientSlotDiscovery": false,
  "booking": false,
  "paymentGateway": false
}
```

Migration `0014_scheduling_availability_foundation.sql` is additive and does not
touch `patient_registry`. Production remains untouched. P5-C2 must add
server-authoritative slot calculation and transactional slot locking before any
patient booking route can be enabled.
