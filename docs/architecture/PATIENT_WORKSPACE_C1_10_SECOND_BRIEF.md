# Patient Workspace C1 — 10-Second Clinical Brief

**Status:** C1 design contract / implementation guardrail  
**Date:** 2026-09-09  
**Scope:** physician-facing Patient Workspace  
**Patient-facing Care Hub:** separate product shell and out of scope

## 1. Design objective

The Patient Workspace must let a physician answer, in roughly ten seconds and without opening multiple tabs:

1. Who is this patient in the current practice context?
2. What is the currently recorded clinical picture?
3. What changed since the previous comparable encounter?
4. What needs review now?
5. Which important facts are missing, partial, stale, or otherwise uncertain?
6. Where should the physician go next for detail or reviewed decision support?

The screen is not a database viewer. It is a clinically ordered reading surface over authoritative patient data.

## 2. Core safety distinction

C1 separates two concepts that must never be conflated.

### Current Clinical Picture

A factual summary of available patient data: verified/accepted clinical contexts, medication state, latest observations, encounter timing, recorded changes, and data coverage.

### Review Posture

A workflow-oriented statement describing why the record deserves attention now. It is **not** a diagnosis, prognosis, global disease severity score, or autonomous triage decision.

C1 may derive Review Posture only from transparent factual conditions such as:

- recorded comparable changes exist;
- a medication is explicitly `held` or `uncertain`;
- a source observation carries an abnormal flag;
- important Patient Core families are partial or unavailable;
- no previous comparable encounter is available.

C1 must not infer that a patient is clinically stable merely because no change is recorded.

Future clinically meaningful posture such as urgent/high-risk/controlled must come from reviewed, versioned Clinical Module rules with source provenance. Presentation code must not invent thresholds.

## 3. Semantic hierarchy

Layout presets may change geometry but not information priority.

### Level 1 — Persistent patient strip

Always-visible compact identity and continuity context:

- patient name when recorded;
- practice-scoped primary identifier mask;
- date of birth when recorded;
- record state;
- latest encounter date;
- data-as-of indicator.

The strip must remain compact. It is not a second dashboard.

### Level 2 — 10-Second Brief

The visual focal point. It contains:

- Review Posture headline;
- concise reason text;
- high-signal factual indicators;
- data coverage/uncertainty state;
- last comparable interval when available.

No opaque numeric health score is permitted.

### Level 3 — Attention Now

A bounded list of facts that deserve immediate visual scanning:

- source-flagged observations;
- held/uncertain medications;
- newly recorded or changed comparable facts;
- missing/partial data families.

This lane reports recorded states. It does not assign clinical significance unless a reviewed module supplies it.

### Level 4 — What Changed

Show a small number of the latest comparable changes first, with an explicit link/expansion for all changes.

Change detection follows Patient Clinical Core completeness semantics:

- complete vs complete may assert add/remove/change;
- partial vs partial may assert only same-key changes;
- unavailable families are omitted;
- missing data must never become a false removal.

### Level 5 — Current State

Grouped, scannable current facts:

- known cross-cutting Clinical Contexts;
- medication state;
- latest observations;
- problems and allergies once authoritative sources exist.

Raw tables are secondary drill-down, not the initial reading surface.

### Level 6 — Longitudinal evidence

- trends;
- encounter timeline;
- signed physician orders;
- documents/referrals/notes as their authoritative services join the shared timeline.

### Level 7 — Next clinical actions

Contextual entry to reviewed workflows such as Clinical Modules, evidence, medication reconciliation, investigations, and encounter actions. Specialty modules do not dominate top-level navigation.

## 4. Review Posture states for C1

These are **workflow presentation states**, not clinical severity classes.

### `review_recorded_changes`

Use when comparable recorded changes exist, or when current recorded facts include a held/uncertain medication or a source-flagged observation.

Suggested language:

> Review recorded changes

Supporting text must state what triggered the posture.

### `coverage_limited`

Use when no higher review trigger exists but one or more important Patient Core families are partial or unavailable.

Suggested language:

> Clinical picture is incomplete

This must never render as reassuring green/stable status.

### `current_snapshot_available`

Use only when a current snapshot exists, no review trigger is present, and the relevant projection families are complete for their declared source scope.

Suggested language:

> Current recorded snapshot available

This still does **not** mean the patient is clinically stable.

### `first_recorded_encounter`

Use when no previous comparable encounter exists.

Suggested language:

> Baseline encounter — no prior comparison

## 5. Visual language

- One strong focal region above the fold; avoid a wall of equal-weight cards.
- Use whitespace and typography before color to establish hierarchy.
- Color is supplemental only; every state requires text/icon semantics.
- Touch/stylus targets should be comfortably selectable.
- Persian RTL and English LTR must preserve the same semantic reading order.
- Dense clinical content should use progressive disclosure.
- Avoid decorative charts that do not improve a clinical decision.

## 6. Dedicated route and migration

The physician-facing canonical workspace route for C1 is:

`/patients/[patientId]`

`/patient` remains the separate Patient Care Hub entry and must not be overloaded.

The existing `/records` archive remains a patient discovery/compatibility surface during migration. When a stable Patient Record v2 `patientId` is resolved, the UI should offer a direct transition to the dedicated Patient Workspace.

The old preview may remain temporarily for compatibility, but new clinical hierarchy belongs to the dedicated workspace.

## 7. Data mapping for C1

Primary read source:

`GET /v1/patients/:patientId/longitudinal`

Consumer contract:

`PatientLongitudinalReadModel`

C1 uses:

- `context.identity` → patient strip;
- `context.clinicalContexts` → known context chips;
- `context.medications` → current medication state and medication attention;
- `context.observations` → latest values and source abnormal flags;
- `changesSincePreviousEncounter` → What Changed and comparison coverage;
- `timeline` → recent longitudinal activity;
- collection `completeness` and `gapReason` → uncertainty/data coverage.

C1 does not create a second patient state store.

## 8. Explicit non-goals

C1 does not:

- diagnose new disease;
- calculate a global patient health score;
- infer clinical stability;
- invent urgent thresholds;
- rank medications;
- change Clinical Module authority;
- merge practice-local records through global identity;
- replace authoritative medication/problem/allergy stores;
- add a new persistence schema.

## 9. Acceptance criteria

C1 is acceptable when:

1. a physician can open a dedicated patient page without navigating the archive preview;
2. identity, latest encounter, current data coverage, review posture, attention facts, and What Changed are visible without deep navigation;
3. incomplete data is visually distinguishable from known absence;
4. no visual state claims clinical stability or severity without reviewed clinical authority;
5. current medication, latest observation, clinical-context and timeline facts remain traceable to Patient Clinical Core data;
6. `/records` can transition to the dedicated patient route while existing compatibility behavior remains functional;
7. RTL/LTR and responsive layouts preserve semantic priority;
8. typecheck, lint, repository tests, and critical web E2E remain green.

## 10. Future evolution

After C1, reviewed Clinical Modules can supply explicit, versioned signals to a later Clinical Posture Aggregator. That aggregator may prioritize true clinical urgency or control state, but it must expose its reasons, patient facts, missing facts, module/rule/version and evidence provenance. C1's Review Posture remains a presentation/workflow concept until that authority exists.
