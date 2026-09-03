# P5-B4 — Multi-practice patient account context

Status: read-model/selection implementation checkpoint; runtime activation
remains OFF.

## Scope

P5-B4 completes the P5-B global-account boundary by giving an authenticated
patient one patient-safe list of independently scoped practice relationships
and an explicit context-selection operation.

```text
one patient_account session
  -> practice context A -> care relationship A -> optional local record A
  -> practice context B -> care relationship B -> optional local record B
```

The service does not aggregate clinical content, merge records, switch a
clinician session or issue a Portal/clinical access token.

## Read-model invariants

1. Every query is anchored to the authenticated `patient_account_id` and
   returns at most 100 context rows.
2. A context is identified by its care relationship and includes only practice
   ID, safe provider snapshot, relationship state, link booleans and update
   time. It never returns local patient IDs, Portal user IDs, identifiers,
   clinical data or another patient's rows.
3. Terminal contexts remain visible as history but cannot be selected.
4. `legacyPortalBridgeAvailable` is true only for an active relationship, a
   currently verified patient account, an explicit linked local record and a
   separately reviewed verified active Portal bridge for that exact account,
   practice and record.
5. Context selection requires patient authentication and explicit confirmation,
   rechecks ownership/state server-side, rate-limits event creation and writes a
   patient security event.
6. The browser stores only the selected care-relationship UUID in
   `sessionStorage`; it is a view preference and is never accepted as an
   authorization credential.

## Authorization boundary

Every selection response hard-codes:

```json
{
  "grantsClinicalAccess": false,
  "grantsCrossPracticeAccess": false
}
```

Practice context selection does not change existing Portal authorization. A
later activation must preserve explicit verified-link exchange and independently
prove active-relationship plus exact-local-record checks before it can become a
clinical authorization input.

## HTTP boundary and rollout

- `GET /v1/patient-practice-contexts/capabilities`
- `GET /v1/patient-practice-contexts`
- `POST /v1/patient-practice-contexts/select`

`MULTI_PRACTICE_PATIENT_ENABLED` defaults to false and additionally depends on
Patient Identity v2 plus Care Relationships. RC must deploy with every new P5-B
capability OFF; Production remains untouched.
