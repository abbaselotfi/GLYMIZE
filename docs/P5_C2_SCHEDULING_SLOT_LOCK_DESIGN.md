# P5-C2 — Candidate slots and transactional slot holds

Status: additive implementation checkpoint; discovery and locking activation
remain OFF.

## Scope

P5-C2 turns a published P5-C1 provider schedule into bounded informational
candidate slots and adds a five-minute patient-owned hold. It does not create
an appointment, confirm a booking, charge a patient or grant clinical access.

Candidate generation is server-authoritative and applies:

- the provider policy's validated IANA time zone;
- recurring and additional-availability windows;
- whole-day and partial unavailable/leave exceptions;
- visit duration and before/after buffers;
- booking horizon and minimum notice relative to server time;
- maximum daily capacity;
- active cross-practice holds for that physician.

Responses are capped at 500 slots across a maximum 31-day request range.
Nonexistent local times during a clock transition are discarded. Raw rules and
internal lock intervals are not exposed in the public result.

## Transaction and race boundary

Hold acquisition recomputes the requested candidate immediately before the
write. One D1 `batch` then records expired-hold events, expires stale holds,
performs an overlap-guarded insert and writes hold/security events.

Cloudflare documents D1 batches as SQL transactions whose statements execute
sequentially and roll back as a unit on failure. D1 also processes an individual
database's queries one at a time. The overlap predicate is therefore evaluated
inside the same transaction as insertion; a partial unique index on physician
plus exact start is a second database backstop.

- <https://developers.cloudflare.com/d1/worker-api/d1-database/#batch>
- <https://developers.cloudflare.com/d1/platform/limits/>

The locked interval includes policy buffers, so two visits cannot overlap
operational buffer time even if their visible appointment intervals do not.
Policy revision, visible start/end and internal lock boundaries are immutable on
the hold.

## Authority and isolation

Public discovery requires a published directory profile, published schedule,
active physician membership and currently verified IRIMC identity.

Acquiring a hold additionally requires:

- authenticated active global patient account;
- verified patient proofing;
- active care relationship in the exact practice;
- the relationship's assigned physician to match the schedule;
- explicit confirmation and an account-scoped abuse limit.

List and release operations are anchored to the authenticated patient account.
Possessing a provider ID, timestamp or hold ID is insufficient to cross the
practice/account boundary.

## HTTP and rollout boundary

- `GET /v1/scheduling/providers/:providerProfileId/slots?from=&to=&mode=`
- `GET /v1/scheduling/slot-holds`
- `POST /v1/scheduling/slot-holds`
- `POST /v1/scheduling/slot-holds/:id/release`

`SCHEDULING_SLOT_DISCOVERY_ENABLED` depends on P5-C1 availability and Provider
Directory. `SCHEDULING_SLOT_LOCKING_ENABLED` additionally depends on Patient
Identity v2 and Care Relationships. Both default to false.

Every candidate is `informational=true` and `reserved=false`. Every hold returns
`bookingCreated=false` and `grantsClinicalAccess=false`. Booking, appointment
lifecycle and payment remain hard-coded OFF until later Roadmap checkpoints.
