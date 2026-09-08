# GLYMIZE — Patient Clinical Core Architecture Inventory

**Status:** B1 architecture inventory — factual baseline and target boundary  
**Roadmap:** `docs/ROADMAP.md`  
**Architecture policy:** `docs/architecture/MODULARITY_AND_CHANGEABILITY_POLICY.md`  
**Baseline:** `main@b135925898239b2e6628064aec6a679d903bc718`  
**Date:** 2026-09-09  
**Scope:** Architecture/documentation only. No runtime schema, clinical rule, datastore authority, deployment flag, or production behavior is changed by this inventory.

---

## 1. Why this inventory exists

The canonical GLYMIZE roadmap now places the longitudinal patient record and shared Patient Clinical Core ahead of new specialty expansion.

Before implementing that core, this document establishes:

1. what patient/practice/clinical assets already exist and must be reused;
2. which runtime and persistence boundaries are already authoritative;
3. which responsibilities are currently concentrated in large façades or contracts;
4. the target boundary between patient persistence, clinical context, medication intelligence, clinical modules, AI, and presentation;
5. the interaction contract for a visual-first, touch/pen-first physician experience;
6. the gaps that later B-series tasks must close without creating a second patient store or a new monolith.

The principal design objective is not to collect the maximum amount of data on one screen. It is to convert the longitudinal record into high-signal clinical awareness while preserving complete source detail on demand.

---

## 2. Non-negotiable invariants

These constraints apply to all Patient Clinical Core work.

### 2.1 Existing Patient Record authority remains authoritative

The Cloudflare Worker/D1 Patient Record v2 runtime remains the patient/encounter write and persistence authority unless a separately approved architecture migration changes it.

The Patient Clinical Core must therefore be built as contracts, normalization/projection services, derived read models, and modular UI/clinical consumers over the existing authority.

**Do not create a second patient database or parallel patient-record authority.**

### 2.2 Practice-local clinical record remains distinct from global identity

The existing global patient identity is additive. It must not silently merge practice-local clinical records.

Identity, practice context, and record authority must remain explicit in every future Patient Clinical Core contract that crosses those boundaries.

### 2.3 Shared facts are represented once

A fact such as an allergy, medication, eGFR, potassium result, pregnancy context, weight, or diagnosis must not be independently re-entered and maintained by each specialty module.

Clinical modules consume canonical shared patient facts and may derive module-specific interpretations without becoming new sources of truth for the underlying fact.

### 2.4 Clinical modules do not own persistence

Domain packs such as Diabetes, Kidney, Cardiovascular, Pulmonary, Gastroenterology/Hepatology, Infectious Disease, Neurology, Rheumatology, and Hematology must not write their own patient stores.

They consume a versioned patient-context contract and produce traceable findings, recommendations, routing hints, and physician-confirmed actions.

### 2.5 AI is not clinical authority

AI may summarize, query, explain, draft, identify missing information, and propose physician-reviewable actions.

It must not silently overwrite patient facts, bypass deterministic safety rules, become a hidden medication-ranking authority, or convert a draft into an order without an explicit clinician-confirmed action path.

### 2.6 Modularity policy is normative

Patient Clinical Core work must comply with `MODULARITY_AND_CHANGEABILITY_POLICY.md`.

In particular:

- no God files or God components;
- no central file that accumulates every future patient fact;
- no giant clinical `if / else if / switch` tree;
- explicit contracts and dependency direction;
- rule/data-driven expansion;
- independently testable modules;
- no circular dependencies;
- large existing façades are compatibility/decomposition targets, not places to add unrelated responsibilities.

### 2.7 Physician interaction is visual-first and touch/pen-first

The physician-facing core must optimize for finger/stylus/tablet use and minimal typing.

The default experience should create clinical awareness through visual status, trends, change detection, structured selections, and direct actions. Raw data and detailed tables remain accessible when needed, while critical values and safety-relevant facts remain immediately visible.

---

## 3. Current runtime dependency map

The present architecture already provides most of the required authority boundaries.

```text
Physician Web Workspace
        │
        ├── shared type-safe contracts
        │
        ▼
Cloudflare Admin/Runtime Worker
        │
        ├── Patient Record v2 routes/services
        ├── Patient identity / practice context
        ├── Orders / investigations
        ├── Provider / referral / scheduling services
        └── authorization / audit boundaries
        │
        ▼
Cloudflare D1
  authoritative longitudinal patient/practice runtime data
```

Clinical reasoning is a separate consumer:

```text
Canonical/normalized Patient Context
        │
        ├── Medication Intelligence / safety
        ├── Clinical Engine shared primitives
        ├── Clinical Module registry
        │     ├── Diabetes
        │     ├── Kidney / Cardiovascular
        │     └── future reviewed modules
        │
        └── Evidence layer
```

AI is also a consumer rather than a persistence authority:

```text
Curated PatientContextView + provenance + evidence
        │
        ▼
AI Copilot / Evidence Assistant
        │
        ├── summary
        ├── chart question
        ├── explanation
        ├── missing-data prompt
        └── draft action
                 │
                 ▼
          physician confirmation
```

The Patient Care Hub is a separate patient-facing projection/shell over permitted data and actions. It is not a second clinical record.

---

## 4. Existing assets inventory

### 4.1 Patient Record v2 Worker modules

The Worker already has a partially decomposed Patient Record v2 area:

| Existing path | Current responsibility | B-series disposition |
| --- | --- | --- |
| `apps/admin-worker/src/patient-record-v2/archive.ts` | patient archive/workspace read concerns | Preserve; later align behind Patient Core read contracts |
| `apps/admin-worker/src/patient-record-v2/context.ts` | focused record/runtime context support | Preserve; keep small and cohesive |
| `apps/admin-worker/src/patient-record-v2/orders.ts` | patient investigation/order runtime concerns | Preserve; expose through action/read contracts rather than duplicate logic |
| `apps/admin-worker/src/patient-record-v2/trends.ts` | longitudinal trend reads | Preserve and reuse for visual-first trend projections |
| existing Patient Record v2 route/façade modules outside this subfolder | compatibility/orchestration and broader runtime behavior | Do not expand into a new monolith; decompose incrementally when touched |

The presence of `archive`, `orders`, `trends`, and `context` is an important positive baseline: the Patient Clinical Core can grow by adding bounded responsibilities rather than replacing the runtime.

### 4.2 Shared patient/practice contracts

The contracts package already contains distinct patient-adjacent contract families:

| Existing path | Existing concern | Target treatment |
| --- | --- | --- |
| `packages/contracts/src/patient-record-v2.ts` | longitudinal patient/encounter transport contracts | Preserve compatibility; avoid accumulating all future Patient Core types here |
| `packages/contracts/src/patient-identity.ts` | global patient identity | Preserve separate identity boundary |
| `packages/contracts/src/patient-identifier.ts` | identifiers | Preserve and reference rather than duplicate |
| `packages/contracts/src/patient-practice-contexts.ts` | patient/practice context | Preserve explicit practice scoping |
| `packages/contracts/src/physician-orders.ts` | physician order contracts | Reuse for physician-confirmed action paths |
| `packages/contracts/src/patient-portal.ts` | patient portal/Care Hub boundary | Keep separate from clinician UI contracts |
| `packages/contracts/src/care-relationships.ts` | care relationships | Reuse as longitudinal care context |
| `packages/contracts/src/referrals.ts` | referral workflows | Reuse as actions/timeline context |
| `packages/contracts/src/scheduling.ts` | scheduling | Reuse as workflow context, not clinical fact authority |
| `packages/contracts/src/index.ts` | broad public export aggregation | Keep as export façade only; do not make it the implementation home for new logic |

`patient-record-v2.ts` and the package index are already relatively concentrated compatibility/export surfaces. Future Patient Clinical Core contracts should be split into small families rather than appended indefinitely to either file.

### 4.3 D1 patient/practice foundation

The D1 migration history demonstrates an existing longitudinal foundation rather than a blank schema:

- `0003_longitudinal_patient_records.sql` — longitudinal patient-record foundation;
- `0004_encounter_snapshot_revisions.sql` — immutable/revision-aware encounter snapshot support;
- `0005_patient_portal_v1.sql` — portal/patient session-data foundation;
- `0007_global_patient_identity_v2.sql` — additive global identity;
- later provider/referral/relationship/practice-context/scheduling/access-role migrations extend the patient/practice graph.

B1 therefore does **not** recommend replacing D1 or creating a generic new clinical database before proving a missing persistence requirement.

### 4.4 Existing physician-facing patient capabilities

The repository current-state baseline records the following already-implemented physician workspace capabilities:

- patient context/header;
- medication reconciliation;
- investigations/orders;
- laboratory trends;
- encounter timeline;
- change summaries;
- patient archive/workspace reads;
- Care Team intake/handoff;
- practice-scoped patient access and roles.

These should be composed into the new Patient Clinical Core experience rather than independently reimplemented.

### 4.5 Existing clinical-engine assets

The clinical engine already provides reusable cross-domain primitives:

- versioned rule-pack concepts;
- evidence registry;
- lab registry/parser;
- patient-document parser;
- Decision Graph v2;
- dose and regimen primitives;
- cost, insurance, inventory, and market primitives;
- investigation and specialist-escalation primitives;
- product/dose safety and hard-exclusion mechanisms;
- insulin conversion;
- reviewed cardiometabolic foundations;
- deterministic/randomized/metamorphic/adversarial test infrastructure.

The Patient Clinical Core should provide normalized facts to these consumers; it should not absorb their clinical decision authority.

### 4.6 Existing AI assets

Existing AI/Evidence Assistant infrastructure includes:

- Evidence Assistant;
- configurable model/provider administration;
- provider-secret separation;
- versioned Worker AI model configuration;
- explicit isolation from clinical ranking/execution authority.

This is sufficient foundation for a future patient-context AI contract; a new AI subsystem is not required for B1/B2.

---

## 5. Target Patient Clinical Core boundary

The Patient Clinical Core should become a stable shared representation of the patient's longitudinal clinical state, not another storage engine.

### 5.1 Core responsibility

The core should normalize and expose:

- what is known about the patient;
- when it was true/effective;
- where it came from;
- whether it is current, stale, uncertain, patient-reported, or clinician-verified;
- what changed;
- which facts are relevant to a current workflow;
- which facts may safely be passed to clinical modules and AI.

### 5.2 Core does not own

The core should not own:

- specialty treatment ranking;
- medication-market catalogue publication;
- AI provider implementation;
- standalone evidence retrieval;
- scheduling business logic;
- final prescribing;
- autonomous diagnosis;
- patient identity merging policy beyond consuming the established identity boundary.

---

## 6. Target clinical data families

The following are the intended shared Patient Clinical Core families. Their exact implementation schemas are a B2 concern and must not be inferred from this inventory as already implemented.

### 6.1 Identity and scope

- patient identity reference;
- practice-local patient record reference;
- practice context;
- actor/permission context where required;
- record/source scope.

### 6.2 Demographics

- birth date / age representation;
- sex and clinically relevant demographic facts;
- height and other stable demographic/anthropometric context where appropriate.

### 6.3 Problems and diagnoses

A canonical problem representation should distinguish at least conceptually:

- active;
- resolved/historical;
- suspected/unconfirmed where supported;
- onset/recorded time;
- source/provenance;
- review state;
- links to supporting findings, medications, plans, and modules.

This becomes the base of a future Problem Graph rather than merely a flat diagnosis list.

### 6.4 Allergies and intolerances

Shared allergy/intolerance facts need:

- agent/substance;
- reaction where known;
- severity/criticality where supported;
- verification/source;
- timing;
- uncertainty.

Medication and specialty modules consume this single safety fact family.

### 6.5 Medications and medication history

The shared patient medication state should progressively distinguish:

- active;
- stopped;
- uncertain;
- prescribed;
- patient-reported;
- actually taking / adherence uncertainty where recorded;
- dose, route, frequency, start/stop interval;
- indication where known;
- reconciliation source/date;
- links to the Medication Intelligence catalogue identity.

Medication knowledge such as contraindications and guideline roles remains in Medication Intelligence, not copied into each patient record.

### 6.6 Observations, labs, and vitals

Shared observation facts need:

- canonical observation identity;
- value/state;
- unit;
- effective/specimen time where relevant;
- recorded time;
- source;
- reference/context metadata where safely available;
- review/provenance;
- freshness/staleness state.

Trend projections derive from these facts without becoming a second source of truth.

### 6.7 Encounters and clinically important events

The core should expose longitudinal encounter/event context for:

- office encounters;
- admissions/ED events when available;
- procedures/interventions;
- important clinical milestones;
- linked snapshot/revision history.

### 6.8 Orders and investigations

Physician-confirmed orders/actions remain explicit workflow objects. The Patient Clinical Core should surface their state and relationship to problems/plans without duplicating the order engine.

### 6.9 Referrals and care relationships

Referrals, care relationships, and provider context are important longitudinal care facts for awareness and follow-up, but their workflow services retain their own bounded responsibility.

### 6.10 Documents

Clinical documents should be represented with provenance and extraction status. Parsed/extracted facts must retain links back to source documents and must not silently replace verified structured facts.

### 6.11 Care plans, targets, and actions

The future core should support a single longitudinal view of physician-confirmed plans/goals/actions with explicit ownership/status rather than domain-specific hidden copies.

### 6.12 Cross-cutting Clinical Context

Cross-domain states must be modeled independently from a specialty diagnosis where appropriate, including examples such as:

- pregnancy;
- planning pregnancy;
- postpartum;
- breastfeeding;
- frailty;
- renal functional state;
- hepatic functional state;
- relevant acute illness context.

These contexts can affect Medication Eligibility and multiple clinical modules simultaneously.

---

## 7. Clinical Fact metadata contract

Every reusable fact does not need the same physical table, but the shared read/context model needs consistent semantics.

A future `ClinicalFact` family should be able to expose, where applicable:

```text
stable fact identity
patient/practice scope
clinical concept identity
value/state
unit
status
source
source record reference
provenance
confidence/review/verification state
effective time
recorded time
freshness/staleness
revision/version
```

The crucial requirement is that a clinical consumer can distinguish a current verified fact from a stale, unverified, inferred, or missing one.

---

## 8. Candidate target contracts — not yet implemented

B2 should decide the exact contract split. The following names are architectural candidates, not implementation claims:

```text
ClinicalFact
ClinicalContext
PatientProblem
PatientMedicationState
PatientObservation
PatientEvent
ClinicalAction
CarePlanItem
PatientContextView
PatientChangeSet
ClinicalBrief
ClinicalSourceReference
DecisionRecord
```

These contracts should be organized into small cohesive files/folders, for example conceptually:

```text
packages/contracts/src/patient-core/
  facts.ts
  context.ts
  problems.ts
  medications.ts
  observations.ts
  events.ts
  actions.ts
  provenance.ts
  views.ts
  changes.ts
```

This proposed folder is a target boundary only. B1 does not create or migrate these runtime contracts.

---

## 9. Target read/write authority matrix

| Concern | Write authority | Read/derived consumer |
| --- | --- | --- |
| Practice-local patient record | Worker/D1 Patient Record runtime | Patient Clinical Core projection |
| Patient identity | established identity runtime/D1 | Patient Clinical Core identity reference |
| Encounter/snapshot | Worker/D1 | timeline, change detection, module context |
| Observations/labs | Worker/D1 patient runtime | trends, Clinical Brief, modules, AI context |
| Orders/investigations | existing physician-order runtime | plans/actions/What Changed |
| Medication catalogue knowledge | existing catalogue authority | Medication Intelligence / clinical modules |
| Current patient medication state | Patient Record/reconciliation authority | Medication Intelligence, modules, AI context |
| Evidence/rules | clinical/evidence authority | module results and AI explanations |
| AI-generated draft | no source-of-truth authority | physician review only |
| Physician-confirmed action | appropriate runtime action endpoint | timeline/plan/read model |

No consumer in the right column should create a shadow persistence authority for the left-column concern.

---

## 10. Clinical Awareness Contract — visual-first physician experience

This is a product/architecture contract, not optional UI polish.

### 10.1 Core objective

When the physician opens a patient, the system should prioritize **awareness before data density**.

The initial view should answer, with minimal reading:

1. Who is this patient clinically?
2. What changed?
3. What is important or unsafe now?
4. Which active problems deserve attention?
5. Which action or deeper view is most relevant next?

### 10.2 10-Second Clinical Brief

The brief should be a compact, source-traceable synthesis of the current patient state.

It should not be a long AI paragraph.

Preferred presentation includes:

- compact problem/risk state blocks;
- latest meaningful trends;
- major medication state/safety signals;
- unresolved/overdue items;
- important unknown/stale facts;
- concise one-line change signals;
- drill-down to source/detail.

### 10.3 What Changed

Change detection should be a first-class read model rather than forcing the physician to compare visits manually.

Candidate change types include:

- new/resolved problem;
- medication start/stop/dose/frequency change;
- clinically meaningful lab/vital movement;
- new allergy/intolerance;
- new encounter/admission/procedure;
- new/refined care plan;
- new referral/order/result;
- overdue or missing monitoring;
- change in a shared clinical context.

The change engine must remain deterministic/traceable for clinically consequential flags; AI may summarize the resulting change set.

### 10.4 Trend-first rather than table-first

For repeated numeric observations, the default physician surface should usually show:

- current/latest value;
- direction/trend;
- time interval;
- freshness;
- clinically important marker/state where reviewed;
- compact sparkline or focused chart.

The full numeric table remains available on demand.

Critical or materially abnormal values must not be hidden merely because the design is visually minimal.

### 10.5 Status/risk visual map

Where useful, the Patient Overview may present system/problem state as an interactive visual map rather than a list of raw data.

For example, a high-level clinical canvas can surface renal, cardiovascular, metabolic, pulmonary, hepatic, infectious, neurologic, and other relevant states as **contextual indicators**, not autonomous diagnoses.

Selecting a state opens its supporting facts, trends, evidence, and relevant Clinical Module.

The map must not display an unreviewed diagnosis merely because a routing heuristic detects a signal.

### 10.6 Progressive disclosure

Use a three-level information pattern where appropriate:

```text
Level 1 — awareness
  visual status / trend / concise clinical meaning

Level 2 — focused detail
  values, dates, medication details, supporting facts

Level 3 — source / audit
  raw record, document, revision, provenance, evidence
```

This preserves completeness without flooding the physician with data.

### 10.7 Essential data remains visible

Minimalism must not obscure safety.

Examples of information that may warrant persistent/immediate visibility when relevant include:

- serious allergy;
- critical current medication issue;
- severe/critical lab state;
- pregnancy/lactation context affecting treatment;
- important renal/hepatic impairment context;
- stale/missing fact that blocks a safe decision.

Exact clinical thresholds are not defined by this architecture document and require reviewed clinical rules.

---

## 11. Touch, stylus, and tablet interaction contract

### 11.1 Structured selection before typing

Routine structured data entry should prefer:

- large tap targets;
- chips;
- segmented buttons;
- cards;
- Present / Absent / Unknown;
- Yes / No / Unknown;
- recent/favorite options;
- context-aware quick picks;
- optimized numeric keypad;
- quick date/time selection;
- medication/condition candidate cards;
- direct actions from the current clinical context.

### 11.2 Stylus requirements

Controls must remain comfortably usable with a pen without requiring hover behavior or tiny precision targets.

A stylus should behave as a first-class pointer for:

- selecting findings;
- choosing conditions/medications;
- confirming state;
- opening details;
- navigating charts/timeline;
- optional reviewable annotation where useful.

Handwriting should not become the primary structured-data format when a safer structured choice exists.

### 11.3 Minimal typing policy

Typing is appropriate for:

- narrative assessment/plan;
- rare/unstructured findings;
- nuance not safely reducible to a coded choice;
- optional search when contextual candidates are insufficient.

Typing should not be required to re-enter standard clinical facts the system already knows.

### 11.4 Adaptive intake

Patient context should drive what the physician is asked.

The future intake flow should:

1. load current facts;
2. identify facts needed for the selected workflow/module;
3. reuse valid current facts;
4. surface stale or uncertain facts for confirmation;
5. ask only missing/necessary questions;
6. default to structured tap/pen choices;
7. show why a missing fact matters when it blocks safe decision support.

### 11.5 Shallow navigation

Common tasks should be available within one or two interactions from the current patient context.

Do not bury routine medication, lab, problem, evidence, or plan actions in deep nested menus.

---

## 12. AI patient-context boundary

### 12.1 Curated context, not unrestricted database access

The AI layer should receive an explicitly constructed `PatientContextView` rather than arbitrary access to all database tables.

The context should include only what is permitted and relevant to the task, together with provenance/freshness metadata needed for safe interpretation.

### 12.2 Source-linked output

Patient-specific AI output should be capable of identifying:

- which patient facts were used;
- which relevant fact is stale/missing/uncertain;
- which evidence source supports a clinical explanation;
- which part is a draft or suggestion rather than a deterministic clinical result.

### 12.3 AI tasks appropriate to the core

Potential future tasks include:

- generate/refresh Clinical Brief from structured derived inputs;
- summarize a deterministic `PatientChangeSet`;
- answer chart questions from permitted patient context;
- explain deterministic module/safety outputs;
- identify missing information for a selected workflow;
- draft a plan, patient instruction, order set, referral, or follow-up for physician confirmation.

### 12.4 AI tasks not permitted as hidden authority

AI must not independently:

- invent patient facts;
- mark a suspected condition as diagnosed;
- clear a medication safety exclusion;
- create final orders/prescriptions without confirmation;
- mutate approved rules/evidence;
- silently select a treatment contrary to deterministic authority.

---

## 13. Clinical Module contract

Every future Clinical Module should plug into the shared platform through a bounded interface.

A module definition should be able to declare, conceptually:

```text
module identity / version
maturity state
required facts
optional facts
relevant clinical contexts
medication-safety dependencies
routing hints
supported decisions / outputs
evidence bundle / review metadata
missing-data requirements
actions it may draft
```

A module should not require editing a central branch tree to register a new specialty.

Preferred extension mechanisms include:

- module registry;
- rule registry;
- strategy/policy objects;
- decision-graph nodes/edges;
- typed adapters;
- data-driven configuration where clinically appropriate and reviewable.

The framework should support maturity states such as:

```text
data_only
reference_guidance
reviewed_decision_support
active_recommendation
```

This allows GLYMIZE to add a specialty surface before claiming a full reviewed treatment engine.

---

## 14. Target modular code boundaries

The following are proposed architectural boundaries, not required exact final folder names.

### 14.1 Contracts

```text
packages/contracts/src/patient-core/
  facts
  provenance
  problems
  medications
  observations
  contexts
  events
  actions
  changes
  views
```

Compatibility re-exports may remain at current public paths during migration.

### 14.2 Worker/runtime

```text
apps/admin-worker/src/patient-record/
  reads/
  writes/
  projections/
  changes/
  actions/
  provenance/
```

Existing `patient-record-v2/*` modules should be reused or migrated incrementally; B2 must not perform a big-bang rewrite.

### 14.3 Clinical engine

```text
packages/clinical-engine/src/core/
  patient-context/
  medication-safety/
  evidence/
  routing/
  module-registry/

packages/clinical-engine/src/modules/
  diabetes/
  kidney/
  cardiovascular/
  pulmonary/
  ...
```

Existing Type 2 clinical authority must be migrated only under regression protection; it is not to be rewritten merely to match folder aesthetics.

### 14.4 Physician web

Conceptual decomposition should favor small components such as:

```text
patient-workspace/
  PatientStrip
  ClinicalBrief
  WhatChanged
  ProblemMap
  MedicationOverview
  TrendCards
  Timeline
  PlansActions
  EvidenceDrawer
  ClinicalAssistant
  ClinicalModuleLauncher
```

These names are conceptual. Component boundaries should follow cohesive responsibility, not one component per arbitrary visual fragment.

---

## 15. Dependency direction

Target dependency direction should remain one-way:

```text
presentation
   ↓
application/read contracts
   ↓
Patient Clinical Core projection
   ↓
existing Patient Record runtime/persistence
```

For clinical decisions:

```text
presentation
   ↓
clinical module interface
   ↓
shared patient-context + medication/evidence services
   ↓
reviewed deterministic rule/module authority
```

AI is a side consumer of explicitly provided context, not a layer beneath deterministic clinical authority.

The Patient Clinical Core must not import web presentation concerns, and persistence modules must not depend on specialty UI modules.

---

## 16. Current architecture debt relevant to B-series work

### G1 — Patient contracts remain partially concentrated

`packages/contracts/src/patient-record-v2.ts` is a broad Patient Record transport file and `packages/contracts/src/index.ts` is a large export surface.

**Response:** B2 should introduce cohesive patient-core contract families while preserving compatibility re-exports.

### G2 — Some Worker façades remain large

Patient Record v2 has already extracted `archive`, `orders`, `trends`, and `context`, but broader runtime façades still carry accumulated compatibility/orchestration responsibilities.

**Response:** do not add new unrelated responsibilities to large façades; decompose incrementally when a B-series change touches a cohesive area.

### G3 — No canonical cross-domain PatientContextView is yet established

Existing patient data and clinical input contracts are mature in several areas, but there is not yet one versioned general Adult Medicine patient-context projection for all modules and AI consumers.

**Response:** B2 is the contract/read-model design task.

### G4 — Problem Graph is not yet a canonical shared model

The roadmap target is richer than a diagnosis list.

**Response:** define the minimal problem contract first; graph relationships can expand without making the first implementation overly complex.

### G5 — Freshness/staleness semantics are not yet universal

Some existing safety paths already reason about missing/stale inputs, but Patient Clinical Core needs consistent cross-domain semantics.

**Response:** B2 must define source/effective-time/freshness semantics before AI and Smart Routing depend on them.

### G6 — What Changed needs a canonical change contract

Change summaries exist in the current physician workspace, but a shared versioned `PatientChangeSet` suitable for UI, modules, and AI is not yet established as a platform contract.

**Response:** design a deterministic change projection before AI summarization.

### G7 — DecisionRecord persistence is not yet a production authority

A durable cross-module decision record remains roadmap work.

**Response:** do not invent persistence in B2; define required semantics and schedule persistence only after authority/audit design.

### G8 — AI lacks a canonical general patient-context transport

Evidence Assistant exists and AI providers are configurable, but the Adult Medicine patient-context contract is not yet the stable interface.

**Response:** establish this only after B2 canonical context semantics.

### G9 — Visual/touch primitives are not yet a platform acceptance contract

The app is responsive and bilingual, with existing patient/trend surfaces, but the new visual-first/touch-first North Star requires formal component and usability acceptance.

**Response:** B3 should implement and physician-test the visual Patient Overview against the Clinical Awareness Contract in this document.

### G10 — Clinical module registration is not yet universal

Type 2 is mature but future specialties must not be created by growing central `if/else` structures.

**Response:** establish a typed module registry before the second major specialty module is activated.

---

## 17. B-series implementation sequence

### B1 — Patient Clinical Core architecture inventory

**This document.**

Deliverables:

- authoritative current-state inventory;
- write/read authority map;
- modularity boundaries;
- visual/touch Clinical Awareness Contract;
- AI boundary;
- module boundary;
- gap register;
- ordered next steps.

No runtime/schema/clinical behavior change.

### B2 — Canonical Patient Core contracts and read projection

Target:

- define versioned small contract families;
- define PatientContextView;
- define provenance/freshness semantics;
- define Problem/Medication/Observation/Context views;
- define PatientChangeSet contract;
- derive from existing Patient Record authority;
- add contract/equivalence tests;
- avoid datastore duplication.

### B3 — Visual Patient Overview

Target:

- persistent Patient Strip;
- 10-Second Clinical Brief;
- What Changed;
- problem/risk visual status;
- trend-first cards;
- raw-data drill-down;
- touch/pen-first components;
- accessibility/RTL/LTR validation;
- physician usability scenarios.

### B4 — Medication Intelligence convergence

Target:

- connect canonical patient medication state to shared Medication Intelligence;
- eligibility/safety output with explicit reasons;
- renal/hepatic/pregnancy/cross-domain safety context where reviewed;
- no silent exclusion;
- preserve catalogue authority boundaries.

### B5 — AI Patient Context / Copilot contract

Target:

- curated patient-context transport;
- source-linked chart Q&A;
- Clinical Brief/change summary assistance;
- missing-data explanation;
- evidence-grounded explanation;
- draft-action boundary;
- no clinical-authority escalation.

### B6 — Clinical Module framework and registry

Target:

- typed module definition;
- maturity states;
- required/optional fact declarations;
- routing hints;
- evidence/review metadata;
- module registration without central branch growth.

### B7 — Diabetes migration as first reference module

Target:

- retain proven Decision Graph v2/insulin/medication safety behavior;
- consume shared PatientContextView;
- consolidate Type 1 / Type 2 / diabetes-pregnancy-related surfaces under the Diabetes domain while preserving cross-cutting pregnancy context;
- keep compatibility routes during migration;
- preserve all established safety regression gates.

### B8 — First multidomain expansion

Prefer a domain adjacent to existing validated cardiometabolic work, such as Kidney/Cardiovascular, subject to roadmap/clinical review.

The first second-domain implementation should prove that the module framework actually avoids rewriting the Patient Core or Diabetes module.

---

## 18. B1 acceptance criteria

B1 is complete when all of the following are true:

- [x] Existing patient/practice runtime authority is documented.
- [x] Existing Worker, contracts, D1, clinical-engine, UI, and AI assets are inventoried at architecture level.
- [x] No second patient store is proposed.
- [x] Patient Clinical Core responsibility and exclusions are defined.
- [x] Shared clinical data families are defined without inventing clinical thresholds.
- [x] Proposed modular contract/runtime/UI boundaries are documented.
- [x] Visual-first/touch/pen-first Clinical Awareness Contract is explicit.
- [x] Raw-detail progressive disclosure and critical-value visibility are explicit.
- [x] AI context/authority boundary is explicit.
- [x] Clinical Module extension boundary rejects central `if/else` growth.
- [x] Architecture debt/gaps are identified.
- [x] B2–B8 order is defined.
- [x] No runtime/schema/clinical-rule behavior is changed by B1.

---

## 19. Explicitly out of scope for B1

B1 does not:

- create new D1 tables;
- migrate catalogue persistence;
- activate a new specialty;
- change Type 2 ranking/authority;
- introduce a new clinical threshold;
- change medication safety rules;
- enable the patient portal in production;
- connect a new AI provider;
- implement a diagnostic engine;
- move patient data to PostgreSQL;
- perform a big-bang refactor of existing Patient Record files.

These require their own roadmap tasks, evidence, tests, and approvals where applicable.

---

## 20. Architecture decision for continuation

The B1 conclusion is:

> **GLYMIZE already has enough longitudinal Patient Record, medication, clinical-engine, AI, and physician-workspace foundation to build the new Clinical Workspace by convergence rather than replacement.**

The next implementation task should therefore be B2: establish small, versioned Patient Clinical Core contracts and a read projection over the existing Worker/D1 Patient Record authority.

B2 must preserve the current green behavior baseline and make B3 possible: a physician-facing visual Patient Overview designed for finger/stylus use, fast clinical awareness, progressive disclosure, and minimal typing.
