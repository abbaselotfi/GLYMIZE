# ADR — Canonical Allergy and Problem Authority

**Status:** Proposed — owner decision required; **not accepted**  
**Date:** 2026-09-09  
**Roadmap:** §28.3 `R28-06 — Close Patient Core authority gaps before shared medication safety consumes them`  
**Related:** `PATIENT_CLINICAL_CORE_MIGRATION_ADR.md`, `PATIENT_CLINICAL_CORE_GAP_MATRIX.md`, `R28_06_PATIENT_CORE_AUTHORITY_READINESS_2026-09-09.md`

---

## Decision requested

R28-06 has reached the point where the repository can preserve medication/context/observation readiness without changing authority, but it cannot safely make allergies or problems authoritative because the current Patient Record v2 contract and D1 schema expose no canonical write owner for either family.

This ADR is decision-ready documentation only. It does **not** authorize a migration, write endpoint, backfill, feature activation, clinical rule, freshness cutoff, or production deployment.

The owner must explicitly accept one authority direction before implementation continues past this gate.

---

## Existing invariants

The accepted Patient Clinical Core migration ADR already establishes:

1. Worker/D1 Patient Record v2 is the current patient/encounter persistence and write authority.
2. Patient Clinical Core is a versioned contract/projection layer over that authority, not a second patient database.
3. Practice-local clinical records remain explicit even when global identity exists.
4. Missing facts remain missing/unknown rather than being inferred.
5. Clinical modules and AI are consumers, not patient-fact write authorities.
6. A new D1 migration is permitted only when the semantic cannot safely be represented by existing authoritative structures, ownership is singular, compatibility is explicit, and no second source of truth is created.

The current encounter snapshot contains medications, labs, bounded clinical flags, vitals, demographics, notes and OCR-related material. It does not define canonical allergy or problem-list fields. Bounded clinical flags are cross-cutting contexts, not a general diagnosis/problem authority. Notes and extracted document text are evidence/source material, not canonical structured facts.

---

## Required semantics regardless of option

Any accepted authority must preserve the following before medication safety or specialty modules can consume it as canonical state.

### Scope and identity

- explicit `practiceId` and `patientId` scope;
- no silent cross-practice merge;
- stable fact identity distinct from display text;
- source/provenance and revision history.

### Collection coverage

The system must distinguish:

- `not_collected` / source not yet reconciled;
- `partial` / incomplete or bounded source;
- `known_absent` / an authorized reconciliation explicitly established that the declared family contains no current facts;
- populated facts.

**An empty table or zero query result must never, by itself, mean `known_absent`.**

A collection-level reconciliation/coverage record or equivalent explicit event is therefore required if the accepted design supports authoritative known absence.

### Fact state

Allergy/problem facts must preserve, where applicable:

- verification/review state;
- effective/onset/resolution time;
- recorded time;
- source reference;
- revision/version;
- active/resolved/historical/uncertain state as defined by the shared contracts;
- `freshness: unknown` unless a separately reviewed clinical-use policy supplies a versioned current/stale interpretation.

### Safety boundary

- patient facts do not themselves grant medication eligibility;
- existing reviewed medication/product safety registries remain clinical-rule authority;
- missing or partial facts never imply clearance;
- patient-reported/imported facts may be stored with their actual verification state but must not be silently promoted to clinician-verified state;
- AI/document extraction may propose or stage candidate facts but cannot silently create verified canonical facts.

---

## Options considered

### Option A — Dedicated longitudinal Allergy and Problem authorities inside Patient Record v2 / D1

Add bounded, typed longitudinal persistence responsibilities under the existing Worker/D1 Patient Record v2 authority. Allergies/intolerances and problems would have stable identities plus auditable revisions/state transitions. Collection reconciliation/coverage would be explicit so zero rows cannot masquerade as known absence.

Conceptual boundary:

```text
Worker / D1 Patient Record v2
  ├── patient/encounter authority (existing)
  ├── allergy/intolerance authority (new bounded repository)
  ├── problem authority (new bounded repository)
  └── collection reconciliation/coverage state
             ↓
      Patient Core projection
             ↓
 Medication Intelligence / Modules / AI
```

The exact table names/schema and endpoint permissions are **not** selected by this ADR draft. If accepted, contracts and acceptance tests should precede the migration.

**Advantages**

- preserves the accepted single Worker/D1 runtime authority;
- models longitudinal facts independently from a single encounter snapshot;
- supports explicit active/resolved/review state and source history;
- supports true `not_collected` versus `known_absent` semantics;
- gives medication safety and future specialties one shared canonical source;
- avoids interpreting notes/flags as diagnoses or allergies;
- allows future UI and specialty modules to consume the same facts without owning persistence.

**Costs / risks**

- requires a separately reviewed D1 migration and write/read services;
- requires authorization/audit rules and optimistic/versioned mutation semantics;
- requires explicit compatibility behavior for patients with no prior structured allergy/problem reconciliation;
- needs careful migration/rollback planning because applied D1 migrations are not casually reversed.

**Recommendation:** preferred option if the owner approves a new bounded persistence responsibility inside the existing Patient Record v2 authority.

---

### Option B — Extend encounter snapshots and derive current Allergy/Problem state from latest snapshots

Add allergy/problem fields to immutable encounter snapshots and derive the current state from snapshot history.

**Advantages**

- reuses the existing encounter revision/encryption workflow;
- avoids introducing separate fact repositories initially.

**Problems**

- encounter-scoped reconciliation and longitudinal fact identity become conflated;
- resolving or revising one allergy/problem is coupled to a new encounter snapshot revision;
- `known_absent` remains ambiguous unless explicit collection reconciliation is added anyway;
- cross-encounter source history and current-state resolution become more complex;
- future modules would depend on a visit-oriented representation for facts that should survive independently across visits.

**Assessment:** not recommended as the canonical long-term authority. Snapshot copies may still carry encounter-time context after a dedicated authority exists, but they should not silently become the sole longitudinal source of truth.

---

### Option C — Promote physician notes, clinical flags, OCR/document extraction, or AI output to authority

**Assessment:** rejected.

These are evidence/context/candidate sources with different semantics. Promoting them would allow unstructured or inferred material to become canonical facts without an explicit structured confirmation path. Bounded clinical flags are not a general problem list, and document/AI extraction cannot become verified authority automatically.

---

### Option D — Use signed plans/orders as Allergy/Problem authority

**Assessment:** rejected.

Signed plans and medication/investigation orders are physician-confirmed action objects, not the longitudinal source of allergies or diagnoses/problems. Reusing them would collapse action authority and patient-fact authority.

---

### Option E — Create a separate Patient Core datastore or move this authority to PostgreSQL now

**Assessment:** rejected under the accepted migration ADR unless a separate future architecture decision replaces the runtime of record.

This would create a second patient source of truth or prematurely move runtime authority away from Worker/D1.

---

## Recommended decision

**Recommend Option A:** keep one runtime of record and add dedicated, typed longitudinal Allergy and Problem persistence responsibilities inside Worker/D1 Patient Record v2, with explicit collection reconciliation/coverage semantics.

This recommendation is **not accepted merely by being written here**. The owner must explicitly approve it before any migration or write path is implemented.

If approved, the follow-on implementation should remain modular and staged:

1. define exact versioned write/read contracts and collection reconciliation semantics;
2. define permission/audit and optimistic-concurrency behavior;
3. add focused repository/service modules rather than expanding a central façade;
4. propose the D1 migration independently;
5. project accepted facts into existing `PatientAllergyIntoleranceView` and `PatientProblemView` contracts;
6. preserve `not_collected` for historical patients until an explicit reconciliation occurs;
7. add equivalence/fail-closed tests before any medication-safety consumer treats the source as authoritative;
8. do not backfill canonical facts from notes, bounded clinical flags, OCR text or AI inference without explicit reviewed confirmation.

---

## Minimum acceptance tests after approval

An implementation following Option A must prove at least:

1. zero rows without a reconciliation record => `not_collected`, not `known_absent`;
2. explicit completed reconciliation with zero facts => `known_absent` for that declared family/scope;
3. partial/imported candidate data remains partial/unverified as appropriate;
4. one practice cannot read or mutate another practice's facts;
5. fact revisions preserve source, actor, time and prior history;
6. resolving a problem or allergy does not delete historical provenance;
7. unverified patient-reported/imported facts cannot silently become verified;
8. notes/OCR/AI suggestions cannot directly write verified canonical facts;
9. missing allergy/problem data never grants medication clearance;
10. existing Type 2 Decision Graph and product-safety authority remain unchanged;
11. legacy patients remain readable without forced synthetic backfill;
12. rollback can disable the new consumer/write path without corrupting existing Patient Record v2 data.

---

## Owner decision gate

Choose one of the following explicitly before implementation:

- **Accept Option A** — authorize detailed contract/schema design and a separately reviewed migration/write-path implementation under existing Worker/D1 Patient Record v2 authority;
- **Choose Option B** — authorize snapshot-based authority design instead, with explicit collection reconciliation semantics;
- **Request another option/revision** — keep R28-06 gated and make no authority change.

Until that decision is recorded, R28-06 remains partially complete and R28-07 must not treat allergy/problem authority as satisfied.
