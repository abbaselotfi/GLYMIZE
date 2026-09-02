# P5-B3 — CareRelationshipService lifecycle

Status: additive implementation checkpoint; runtime activation remains OFF.

## Ownership boundary

```text
global patient_account
  -> one care_relationship per practice
  -> optional verified link to that practice's patient_registry row
```

`patient_registry` remains the authoritative practice-local clinical record. A
relationship never moves, merges, clones or globally owns that record.

## Creation and provenance

1. P5-B3 creates a relationship request only from an authenticated patient's
   own P5-B2 referral redemption.
2. `care_relationship_provenance` immutably retains every consumed referral
   redemption. Code possession or anonymous inspection cannot create a row.
3. Request retries are idempotent. A patient has one canonical relationship per
   practice; a new referral may reopen a terminal relationship as `requested`
   while the append-only event/provenance history remains intact.
   A referral to a different physician cannot silently reassign an existing
   requested/active/paused relationship.
4. Referral redemption and relationship creation are distinct audited steps.
   Existing P5-B2 `pending_care_relationship` rows can be converted explicitly.

## Lifecycle and actor authority

- Patient: request, list own relationships, withdraw a request or revoke an
  active/paused relationship.
- Assigned physician: accept/reject a request; pause/resume/end an established
  relationship; link or unlink a verified local record. Lifecycle transitions
  additionally require the physician's IRIMC status to remain verified.
- Authorized assistant: list and link/unlink a verified local record through
  explicit `care_relationships.manage` plus existing record permissions. An
  assistant cannot accept, reject, pause, resume or end on behalf of a physician.
- Platform admin gains no clinical access from the domain.

Transitions are conditional and append-only events record actor, prior/next
status, bounded reason code and time. Terminal states are `ended`, `revoked`
and `rejected`.

## Proofing and local record linking

- An unverified or pending global account may request a relationship but a
  physician cannot activate it until proofing status is `verified`.
- A local record link is allowed only when a separately reviewed, currently
  verified `portal_user_account_links` row maps that exact global account and
  practice to that exact `patient_registry` row.
- Identifier equality, national-ID knowledge and referral possession are never
  used to discover or auto-link an existing local record.
- Link/unlink does not modify `patient_registry` or the reviewed legacy bridge.
- Unlink is a fail-safe removal operation: an authorized practice actor may
  remove an existing local-record pointer even after proofing/status changes or
  while new linking is disabled. It never creates or expands access.

## Authorization boundary

P5-B3 records relationship state but deliberately reports
`clinicalAuthorization=false`. Existing Portal/Patient Record authorization is
not switched during this checkpoint. A later activation gate must require both
an active relationship and an explicitly linked local record, preserve current
session migration safety, and prove no cross-practice access regression.

## HTTP boundary

- `GET /v1/care-relationships/capabilities`
- `GET /v1/care-relationships/patient`
- `POST /v1/care-relationships/requests`
- `POST /v1/care-relationships/:id/patient-revoke`
- `GET /v1/care-relationships/practice`
- `POST /v1/care-relationships/:id/{accept|reject|pause|resume|end}`
- `POST /v1/care-relationships/:id/{link-local-record|unlink-local-record}`

`CARE_RELATIONSHIPS_ENABLED` defaults to false. The public service capability
also requires Patient Identity v2. Local linking is available only when Care
Relationships, Patient Identity v2 and the independently controlled Patient
Record Linking capability are enabled.

Runtime-user/practice hard deletion is disallowed while relationship provenance
exists; the established identity-purge path preserves the audit history.

## Rollout gates

1. Validate migrations `0001` through `0013` on a fresh isolated local D1.
2. Exercise request, idempotency, proofing gate, actor separation, lifecycle,
   verified link/unlink and multi-practice isolation locally.
3. Pass repository tests, typecheck, build and secret/diff checks.
4. Apply `0013` to RC only and deploy with `CARE_RELATIONSHIPS_ENABLED=false`.
5. Keep Production schema, Worker, configuration and data untouched.
