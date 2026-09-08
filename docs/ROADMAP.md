# GLYMIZE — Canonical Product & Engineering Roadmap

**Status:** Canonical roadmap for new product and engineering work  
**Approved direction date:** 2026-09-09  
**Repository:** `abbaselotfi/GLYMIZE`  
**Product maturity:** Advanced prototype / pre-clinical decision-support platform  
**North Star:** Patient-centered Clinical Intelligence Workspace for Adult Medicine

> This roadmap supersedes the **future product direction and execution ordering** in older roadmap documents where they conflict with this file. Older documents remain historical/audit references and must not be deleted merely because this roadmap is newer.
>
> Existing implemented behavior, accepted architecture ADRs, safety boundaries, migrations, tests, and compatibility contracts remain authoritative unless this roadmap explicitly schedules a reviewed migration.

---

## 1. Product North Star

GLYMIZE is no longer planned as a disease-specific diabetes application.

GLYMIZE is to become a bilingual Persian/English, physician-first, patient-centered **Clinical Intelligence Workspace for Adult Medicine**, initially focused on internal-medicine practice and its subspecialties, with diabetes as the first mature and safety-tested clinical module.

The primary clinical workflow is:

```text
Practice
  → Patient
    → Longitudinal Clinical Record
      → 10-Second Clinical Brief
        → What Changed
          → Problems / Risks / Medications / Labs
            → Smart Routing
              → Clinical Modules
                → Evidence + Decision Support
                  → Physician-confirmed Action
                    → Follow-up / Longitudinal Learning
```

GLYMIZE must be useful even when the physician is **not treating diabetes**.

The product should feel like a capable in-clinic assistant that:

- knows the patient's longitudinal clinical context;
- brings the most relevant information forward without forcing the physician to search through the chart;
- reduces typing and navigation burden;
- provides evidence-grounded, patient-specific decision support;
- understands medication safety across multiple conditions;
- converts insights into physician-confirmed actions;
- keeps every recommendation explainable and auditable;
- remains usable with touch, stylus/pen, keyboard, and mouse;
- progressively gains new clinical domains without rebuilding the patient record for each specialty.

### 1.1 Product promise

The target experience is:

> **Open a patient and understand the important clinical story in seconds; make safe, evidence-backed decisions with minimal typing; leave with a clear plan.**

### 1.2 Safety position

GLYMIZE remains a **clinical decision-support system**, not an autonomous diagnosing or prescribing system.

The physician remains responsible for the final clinical decision. AI-generated output must never silently become clinical authority.

---

## 2. Non-negotiable product principles

These principles are mandatory design constraints, not optional polish.

### P1 — Patient first, disease second

The patient record is the product core. Clinical modules consume the same patient facts rather than creating separate disease records.

### P2 — One longitudinal patient story

Demographics, diagnoses, medications, allergies, labs, vitals, encounters, documents, orders, referrals, care plans, and important events must form one coherent timeline and clinical state.

### P3 — Visual-first, touch/pen-first, minimal typing

Routine physician workflows should favor:

- large tap targets;
- selectable chips;
- segmented controls;
- toggles;
- sliders only when clinically appropriate;
- visual body/system selectors when useful;
- single-tap Present / Absent / Unknown controls;
- cards with direct actions;
- trend charts;
- compact diagrams;
- context-sensitive quick actions;
- stylus-friendly selection;
- voice/dictation as an optional accelerator.

Free-text typing must be reserved for information that is genuinely unstructured or cannot be safely represented by structured choices.

### P4 — No deep menu maze

Frequently used clinical actions should be reachable from the current patient context in one or two interactions. Do not require repeated back-navigation, nested menus, or repeated searches for routine tasks.

### P5 — Progressive disclosure

Show the physician what matters now. Preserve full detail behind expansion, drill-down, timeline, or source views.

### P6 — High signal, low alert fatigue

Do not turn GLYMIZE into an alert wall. Prioritize clinically actionable, safety-critical, or materially changed information.

### P7 — Explain every consequential recommendation

For any meaningful recommendation, the system should be able to answer:

- Why this?
- Why not the alternative?
- Which patient facts affected the result?
- Which facts are missing or stale?
- Which evidence/rule/version supports it?
- What is the recommended next action?

### P8 — AI is replaceable; evidence and safety are not

LLM/provider selection must remain an interchangeable reasoning layer. Clinical authority, evidence provenance, medication safety, deterministic rules, and governance remain inside GLYMIZE-controlled layers.

### P9 — No duplicate clinical facts

A fact such as eGFR, potassium, pregnancy context, allergy, or current medication should be represented once in the canonical patient context and consumed by all relevant modules.

### P10 — Local reality matters

International evidence must be reconciled with Iranian market reality, including brands, availability, insurance, price, and locally relevant product metadata where verified.

### P11 — Accessibility is part of clinical safety

Color may improve scanning but must never be the sole carrier of meaning. Visual states require labels/icons/text equivalents and appropriate contrast. RTL/LTR, keyboard accessibility, touch target size, and stylus usability are release requirements.

### P12 — Build the platform first, activate domains safely

The architecture should support the full Adult Medicine scope now, but a clinical domain becomes active only after its evidence, rules, medication coverage, safety constraints, tests, and review gates are ready.

---

## 3. Existing GLYMIZE assets to preserve and reuse

The following are investments, not throw-away prototypes. New work must reuse or migrate them rather than reimplement them without a proven reason.

### 3.1 Patient / practice foundation

- Practice-scoped Patient Record v2.
- Patient identity and additive global identity foundation.
- Patient context/header.
- Medication reconciliation.
- Investigations/orders foundation.
- Lab trends.
- Encounter timeline.
- Visit/change summaries.
- Patient archive and observations.
- Care Team intake and handoff foundations.
- Practice roles/RBAC and patient-access boundaries.
- Provider, referral, care-relationship, and scheduling foundations.
- Patient-facing Care Hub and separate patient shell.

### 3.2 Clinical foundation

- `decision-graph-v2` as the configured live Type 2 authority.
- Versioned clinical rule-pack concepts.
- Evidence registry and evidence metadata.
- Clinical rule precedence work.
- Structural hard exclusions.
- Product/dose safety rules.
- Lab registry and text parser.
- Patient-document parser.
- Investigation and specialist-escalation primitives.
- Dose, regimen, cost, insurance, inventory, and market primitives.
- Insulin conversion module and regression suite.
- Reviewed cardiometabolic medication/domain foundations.
- Deterministic, randomized, metamorphic, adversarial, and multidomain safety test infrastructure.

### 3.3 Medication / catalogue foundation

- Shared medication catalogue/reference data.
- Generic/brand separation.
- Iranian brand/manufacturer/market metadata.
- Insurance/cost concepts.
- Catalogue draft/edit/import/review tooling.
- Worker-only central publication boundary.
- Catalogue source/verification metadata foundation.

### 3.4 AI foundation

- Evidence Assistant.
- Configurable AI provider/model administration.
- Provider-secret separation.
- Versioned Worker AI-model KV payload.
- Current architectural invariant that AI does not alter clinical-engine authority.

### 3.5 Engineering foundation

- TypeScript monorepo.
- Shared contracts.
- Cloudflare Worker/D1 runtime boundaries.
- PWA/offline/update foundations.
- Bilingual RTL/LTR UI.
- Repository-wide typecheck/lint/tests.
- PR validation and critical Playwright flows.
- Schema-versioning work and compatibility guards.

---

## 4. Target product information architecture

The product should have a shallow, patient-centered information architecture.

### 4.1 Top-level physician workspace

```text
Home / Today
Patients
Practice
Clinical Tools
Evidence
Admin / Settings (permission-gated)
```

Clinical specialty areas should not dominate top-level navigation. They are primarily entered through the patient context, Smart Routing, or a Clinical Modules launcher.

### 4.2 Practice Workspace

The Practice Workspace should evolve toward:

- Today / activity overview;
- patient list and smart filters;
- team members and roles;
- tasks/follow-up queue;
- referrals;
- scheduling/availability where enabled;
- unresolved safety or data-quality tasks;
- practice preferences;
- audit/activity surfaces appropriate to permissions.

### 4.3 Patient Workspace

The patient workspace is the centerpiece of GLYMIZE.

Recommended primary surfaces:

1. **Overview**
2. **Problems & Risks**
3. **Medications**
4. **Labs & Vitals**
5. **Timeline / Encounters**
6. **Plans & Actions**
7. **Documents**
8. **Clinical Modules**
9. **Audit / Provenance** where permission and workflow require it

These are conceptual surfaces; the UI should avoid turning them into a deep tab hierarchy. Frequently used information should coexist in a responsive clinical canvas.

### 4.4 Persistent Patient Strip

A compact patient strip should remain visible across patient workflows and include the most safety-relevant context, such as:

- identity and age;
- sex where clinically relevant;
- key allergies;
- important pregnancy/lactation context when relevant;
- selected critical renal/hepatic state summaries;
- major active risk flags;
- last-update freshness indicators.

The strip must remain concise and configurable; it must not become a second dashboard.

---

## 5. Target Patient Clinical Core

The Patient Clinical Core is the canonical shared context consumed by all clinical modules.

### 5.1 Core data families

- patient identity and practice context;
- demographics;
- allergies/intolerances;
- active and historical problems/diagnoses;
- medications and medication history;
- vitals and anthropometrics;
- laboratory observations;
- procedures/interventions;
- encounters;
- admissions/important clinical events;
- orders/investigations;
- referrals;
- clinical documents;
- care plans/goals;
- clinician-entered structured findings;
- patient-reported data where enabled;
- provenance, timestamps, source, confidence/review state, and revision history.

### 5.2 Clinical Fact model

Shared clinical facts should carry enough metadata to support safe reuse:

```text
fact identity
value / state
unit where relevant
effective time
recorded time
source
provenance
review/verification state
freshness/staleness
practice/patient scope
version/revision
```

### 5.3 Clinical Context model

Cross-cutting contexts must be separable from diagnoses.

Examples include:

- pregnancy;
- planning pregnancy;
- postpartum;
- breastfeeding;
- frailty;
- renal functional state;
- hepatic functional state;
- relevant acute illness context.

A context may affect multiple clinical modules and Medication Eligibility simultaneously.

### 5.4 Problem Graph

The long-term target is richer than a flat problem list.

Problems should be able to connect to:

- supporting findings;
- relevant medications;
- targets;
- investigations;
- complications;
- related problems;
- active clinical modules;
- care-plan actions;
- evidence/decision records.

This enables GLYMIZE to reason and present information by clinical relationship rather than merely by chronology.

---

## 6. Ideal patient workspace experience

### 6.1 10-Second Clinical Brief

When the physician opens a patient, GLYMIZE should quickly answer:

- Who is this patient clinically?
- What are the important active problems?
- What changed since the last relevant encounter?
- What is unsafe, overdue, or uncertain?
- What requires attention today?

The brief must be generated from traceable patient data and must allow drill-down to the source.

### 6.2 What Changed

A dedicated change-detection layer should surface clinically meaningful deltas such as:

- new diagnosis/problem;
- medication start/stop/dose change;
- meaningful lab/vital trend;
- new admission/ED event;
- new allergy/intolerance;
- new referral/procedure;
- missed/overdue monitoring;
- important change in risk state.

### 6.3 Trend-first data presentation

For repeated numeric observations, default to visual trend + latest value + clinically relevant context, with the raw table available on demand.

Examples:

- HbA1c;
- eGFR/creatinine;
- potassium;
- ALT/AST;
- lipid measures;
- BP;
- weight/BMI;
- disease-specific measures as domains are added.

### 6.4 Visual clinical status

Use diagrams, compact charts, risk/state badges, timeline markers, and body/system visualizations where they improve understanding.

Color semantics should be consistent across the product, for example:

- neutral/info;
- success/within-plan;
- caution/review;
- high-priority/unsafe;
- unknown/missing/stale.

Colors must always be paired with non-color meaning.

---

## 7. Touch / pen / minimal-typing interaction standard

This section is a mandatory product requirement based on intended clinical use.

### 7.1 Default structured controls

Prefer the following patterns where clinically safe:

- one-tap Yes / No / Unknown;
- Present / Absent / Unknown;
- multi-select chips;
- segmented buttons;
- quick-pick medication and condition lists;
- recent/favorite choices;
- context-specific presets;
- numeric keypad optimized for clinical entry;
- date/time quick selection;
- drag/touch target adjustment only when precision is not clinically unsafe;
- stylus-friendly annotation only where it produces meaningful structured or reviewable output.

### 7.2 Adaptive intake

Do not ask every possible question for every patient.

The intake engine should:

1. read existing patient facts;
2. identify facts required by the active workflow;
3. skip already valid/current information;
4. highlight stale/uncertain data;
5. ask only missing or confirmatory questions;
6. use structured quick choices whenever possible.

### 7.3 Typing policy

Free text is appropriate for:

- clinician narrative;
- unusual symptoms/findings not represented structurally;
- assessment/plan nuance;
- comments and context that cannot be reduced safely.

Free text should not be the default method for entering standard clinical states already represented in the model.

### 7.4 Search policy

Search should be powerful but should not be necessary for routine care. Use:

- contextual suggestions;
- recent items;
- favorites;
- specialty lens prioritization;
- Smart Routing;
- patient-derived relevance;
- predictive but reviewable candidate lists.

---

## 8. Medication Intelligence Platform

Medication Intelligence is a cross-domain core service, not a feature inside the diabetes module.

### 8.1 Target medication object

Medication knowledge should progressively support:

- generic identity;
- brand identity;
- class;
- route/form/concentration;
- indications;
- contraindications;
- cautions;
- interactions;
- duplicate-therapy relationships;
- renal constraints/adjustments;
- hepatic constraints/adjustments;
- pregnancy/lactation constraints;
- age/frailty considerations where reviewed;
- dose/titration rules where reviewed;
- monitoring requirements;
- important adverse effects/warnings;
- disease/domain roles;
- guideline evidence;
- Iranian availability;
- insurance;
- cost/reference-price metadata where verified;
- source/version/review metadata.

### 8.2 Medication Eligibility layer

Before module-specific ranking/recommendation, a shared eligibility/safety layer should determine whether a medication is:

```text
eligible
eligible_with_caution
requires_missing_information
not_recommendable_for_current_context
contraindicated / hard-excluded
```

A medication excluded from recommendation must not silently disappear. The physician should be able to see a concise exclusion reason when clinically useful.

### 8.3 Medication reconciliation as a living process

The patient medication list should distinguish, where possible:

- active;
- stopped;
- uncertain;
- patient-reported;
- prescribed vs actually taken;
- dose/frequency uncertainty;
- indication;
- reconciliation date/source.

---

## 9. Evidence Platform

### 9.1 Multi-authority evidence registry

GLYMIZE should not be bound to one guideline organization.

Initial Adult Medicine evidence families may include, after legal/licensing and clinical-review checks:

- ADA / diabetes authorities;
- Endocrine Society / AACE;
- ACC/AHA / ESC;
- KDIGO;
- GINA / GOLD / ATS / ERS;
- ACG / AASLD / EASL;
- IDSA;
- AAN and disease-specific neurology guidance;
- ACR / EULAR;
- ASH;
- regulatory labels and high-quality supporting evidence where appropriate.

### 9.2 Evidence abstraction

Do not make the product depend on redistributing copyrighted guideline text.

Prefer governed evidence objects such as:

```text
stable evidence ID
source organization
publication/guideline title
version/year
section/table/page locator where permitted
source URL/reference
clinical claim abstraction
strength/grade when source supplies it
review state
reviewer
review date
supersession state
```

### 9.3 Evidence freshness

The system must be able to identify:

- current evidence;
- superseded evidence;
- review due;
- conflicting evidence;
- source unavailable/uncertain.

No clinical rule should silently continue after its supporting evidence has been superseded without a governed review process.

---

## 10. AI Clinical Copilot

AI is a first-class product capability, but not the safety authority.

### 10.1 AI roles

The Copilot may progressively support:

- patient-summary generation;
- chart question-answering;
- pre-visit preparation;
- change summarization;
- evidence retrieval and explanation;
- recommendation explanation;
- missing-information identification;
- differential/problem brainstorming when appropriately bounded;
- document/lab extraction with confirmation;
- draft assessment/plan text;
- draft patient instructions;
- draft orders, referrals, follow-up, or monitoring actions;
- translation and bilingual communication assistance;
- patient-friendly explanation generation.

### 10.2 AI must be patient-context aware

Within a patient workspace, the AI should know only the patient data and permissions it is authorized to access and should automatically inherit the current clinical context, active problem, module, and relevant facts.

### 10.3 AI evidence and provenance

Consequential clinical responses should distinguish:

- patient facts used;
- deterministic GLYMIZE rule output;
- retrieved evidence;
- AI-generated synthesis;
- uncertainty/missing information.

### 10.4 Model abstraction

The product must support replaceable AI providers/models. No clinical workflow should become irreversibly tied to one vendor/model.

### 10.5 AI action boundary

AI may draft or suggest actions. Actions that materially affect care must require physician confirmation and should create an auditable decision/action record where appropriate.

---

## 11. Smart Routing and Specialty Lenses

### 11.1 Smart Routing

Smart Routing is initially a **suggestion layer**, not autonomous diagnosis.

It may use structured patient facts to suggest review areas such as:

- Diabetes / Endocrine review;
- Kidney review;
- Cardiovascular review;
- Pulmonary review;
- Liver/GI review;
- Infection review;
- Neurology review;
- Rheumatology/immune review;
- Hematology review.

The clinician confirms the relevant clinical module/context.

### 11.2 Specialty Lenses

A Specialty Lens changes information priority without creating a new patient record.

Examples:

- General/Internal Medicine;
- Endocrinology;
- Cardiology;
- Nephrology;
- Pulmonology;
- Gastroenterology/Hepatology;
- Infectious Disease;
- Neurology;
- Rheumatology;
- Hematology.

A lens may reorder cards, highlight relevant trends, surface domain-specific quick actions, and prioritize questions. It must continue to consume the same canonical patient facts.

---

## 12. Clinical Module Framework

Every active clinical module should conform to a shared module contract rather than inventing its own architecture.

### 12.1 Module capabilities

A module may declare:

- domain identity/version;
- required and optional patient facts;
- safe minimum inputs;
- clinical contexts consumed;
- evidence authorities;
- eligibility/safety rules;
- objectives/targets where evidence-backed;
- recommendation/decision graph;
- monitoring requirements;
- investigations;
- escalation/referral criteria;
- medication dependencies;
- user-facing cards/visuals;
- AI context extensions;
- test/golden-case suite;
- review/approval state.

### 12.2 Module maturity states

Use explicit states:

```text
foundation
read_only_context
pilot_decision_support
reviewed_decision_support
release_eligible
deprecated
```

A tile existing in the UI must not imply that the module provides active treatment advice.

---

## 13. Clinical domain rollout strategy

### Wave A — Diabetes reference module

Diabetes remains the first mature reference module and should consolidate:

- Type 1 context/workspace;
- Type 2 Decision Graph v2;
- gestational diabetes where clinically defined;
- pregnancy-related cross-cutting context;
- insulin tools/conversion;
- diabetes complications;
- relevant cardiometabolic links.

Do **not** model pregnancy itself as merely a diabetes subtype. Pregnancy/planning/postpartum/breastfeeding are cross-cutting contexts.

Legacy `/type-1`, `/type-2`, and `/pregnancy` routes should initially remain compatible wrappers/redirects until migration and tests prove safe retirement.

### Wave B — Cardiovascular + Kidney

Prioritize domains with strong overlap with existing diabetes/cardiometabolic work:

- hypertension;
- ASCVD risk/secondary prevention;
- heart failure;
- lipid management;
- CKD;
- cardiorenal medication safety;
- selected evidence-backed CKM interactions.

### Wave C — Pulmonary + GI/Hepatology + Infectious Disease

Add domains progressively, each behind its own evidence/review/test gate.

### Wave D — Neurology + Rheumatology + Hematology

Add after the shared platform and earlier domain packs prove the module framework in real clinical workflows.

### Later expansion

Other specialties/disease areas may be added without replacing the core architecture.

---

## 14. Patient Care Hub

The patient-facing product remains a separate shell and authority boundary, while sharing governed patient data.

Target patient-facing functions may include:

- medication list/instructions;
- upcoming tasks and monitoring;
- appointments/follow-up;
- selected lab/result trends appropriate for patient display;
- care-plan goals;
- clinician-approved educational material;
- referral/care-team continuity;
- secure messaging/workflows only when governance and scope are ready.

Patient UI should be significantly simpler than physician UI.

---

## 15. Interoperability and data standards direction

The internal model should progressively become interoperable and mapping-friendly without forcing premature infrastructure migration.

Target compatibility direction:

- FHIR-shaped resources/contracts where useful;
- LOINC-compatible laboratory identity;
- standard problem/diagnosis terminology mappings where licensing and product scope permit;
- international medication normalization plus Iranian product/brand identity;
- explicit source/provenance mapping.

This does **not** automatically authorize a move from the current Worker/D1 runtime to PostgreSQL or another datastore.

---

## 16. Canonical execution roadmap

The phases below define dependency order. Each major engineering task should remain independently reviewable.

### Phase A — Safety Baseline & Roadmap Control

**Status:** Baseline established; roadmap transition in progress.

Objectives:

- preserve the current green regression/safety baseline;
- make this document canonical;
- preserve current runtime/clinical authority boundaries;
- identify old product-scope language that must later be migrated without deleting historical audit records.

Acceptance:

- current full typecheck/lint/tests remain green;
- critical Playwright flows remain green;
- no clinical behavior changed by roadmap documentation;
- no datastore authority changed.

### Phase B — Longitudinal Patient Core v3

**Priority:** Highest implementation priority.

Objectives:

- define the canonical Patient Clinical Core contract;
- unify shared clinical facts and provenance;
- strengthen problem list toward Problem Graph-ready structure;
- formalize medication history/reconciliation state;
- formalize observation/lab/vital longitudinal semantics;
- formalize Clinical Context objects;
- define freshness/staleness semantics;
- define change-detection inputs/outputs;
- preserve practice-local clinical-record authority and existing identity boundaries.

Deliverables:

- architecture ADR/data contract;
- migration plan with backward compatibility;
- schema/contract versioning;
- characterization tests for existing Patient Record v2;
- no-loss migration/equivalence tests;
- Patient Clinical Core read model.

Gate:

No broad UI redesign should depend on unversioned or duplicated patient facts.

### Phase C — Physician Workspace vNext: Visual / Touch-First

Objectives:

- build the new Patient Workspace shell around the Patient Clinical Core;
- implement persistent Patient Strip;
- implement 10-Second Clinical Brief;
- implement What Changed;
- implement trend-first visualization;
- create touch/stylus interaction components;
- introduce adaptive structured intake patterns;
- reduce deep navigation and unnecessary search;
- define specialty lens framework;
- preserve bilingual RTL/LTR behavior.

Acceptance criteria:

- routine high-frequency workflows can be completed without mandatory free-text entry;
- key actions are reachable in shallow navigation;
- all touch targets and visual states meet defined accessibility/usability criteria;
- color is never the sole clinical-state signal;
- responsive desktop/tablet experience is explicitly tested;
- no regression in current patient-record authority or practice isolation.

### Phase D — Medication Intelligence Core

Objectives:

- promote medication data to a shared cross-domain knowledge model;
- create Medication Eligibility/Safety layer;
- normalize indication/safety/monitoring relationships;
- preserve Iranian brands/availability/insurance/cost data;
- connect medication reconciliation to clinical decision support;
- make exclusion/caution reasons visible and traceable.

Acceptance:

- domain modules do not implement duplicate medication safety logic without an explicit reviewed exception;
- hard exclusions fail closed;
- missing/stale safety inputs are represented explicitly;
- recommendation exclusion is explainable;
- current diabetes/insulin behavior remains equivalent where the new shared layer replaces old wiring.

### Phase E — Evidence Platform & AI Copilot vNext

Objectives:

- generalize Evidence Assistant beyond diabetes-specific context;
- establish multi-authority evidence registry;
- add evidence lifecycle/freshness/supersession semantics;
- make patient-context chart Q&A possible within permission boundaries;
- build source-linked clinical answers;
- add pre-visit brief and change summary assistance;
- add draft action generation with physician confirmation;
- keep model/provider replaceable.

Acceptance:

- AI remains unable to mutate deterministic clinical authority;
- consequential output separates facts/rules/evidence/AI synthesis;
- unsupported or missing evidence is represented honestly;
- patient data access follows current RBAC/practice/patient boundaries;
- no autonomous prescribing/order execution.

### Phase F — Clinical Module Framework + Smart Routing

Objectives:

- implement shared Clinical Module contract;
- implement module maturity states;
- implement Smart Routing suggestions;
- implement cross-domain precedence/conflict framework;
- implement Specialty Lens integration points;
- implement shared module test harness.

Acceptance:

- adding a module does not require duplicating the patient record;
- module activation is gated by evidence/review/test state;
- Smart Routing cannot silently establish a diagnosis;
- cross-domain conflicts are surfaced rather than hidden.

### Phase G — Diabetes Migration as Reference Module

Objectives:

- consolidate Type 1, Type 2, gestational-diabetes handling, pregnancy context, and insulin tools under the new Diabetes module architecture;
- preserve `decision-graph-v2` authority unless a separate reviewed clinical migration changes it;
- reuse the current medication, safety, evidence, insulin, and test investments;
- preserve legacy routes during compatibility period;
- redesign diabetes intake using adaptive touch-first controls.

Acceptance:

- current deterministic/stress safety suites remain green;
- Type 2 clinical equivalence is explicitly tested;
- no hard-exclusion regression;
- pregnancy context remains cross-cutting and fail-closed where required;
- insulin conversion remains traceable and review-framed;
- legacy route compatibility is tested.

### Phase H — Initial Clinic-Ready Core Release

This phase is intentionally **before** all future Adult Medicine modules are complete.

Release-visible scope should target:

- Practice → Patient workflow;
- longitudinal Patient Workspace;
- visual/touch-first core;
- Medication Intelligence foundation;
- AI Copilot foundation;
- Diabetes as the first reviewed active clinical module;
- other specialty tiles/lenses only where their maturity state is clearly represented;
- Patient Care Hub capabilities explicitly approved for release.

Required gates:

- clinician usability pilot;
- accessibility review;
- security/privacy/threat review;
- clinical review/sign-off inventory for active rules;
- medication catalogue verification appropriate to launch scope;
- incident/rollback procedures;
- performance/reliability testing;
- audit/provenance review;
- explicit release disclaimer/claims review.

### Phase I — Cardiovascular & Kidney Expansion

Objectives:

- activate reviewed cardiovascular and kidney modules one by one;
- reuse existing CKD/HF/ASCVD/lipid/hypertension foundations where already present;
- test cross-domain medication and objective conflicts against diabetes;
- extend Smart Routing and Specialty Lenses.

Each submodule requires its own evidence, medication coverage, safe inputs, clinician review, golden cases, randomized/adversarial testing as appropriate, and release gate.

### Phase J — Pulmonary, GI/Hepatology & Infectious Expansion

Same gated module process. Do not activate treatment pathways merely because a UI tile exists.

### Phase K — Neurology, Rheumatology & Hematology Expansion

Same gated module process, using the proven shared Patient Core, Medication Intelligence, Evidence Platform, AI, and module framework.

### Phase L — Practice Operations & Patient Continuity Expansion

Progressively mature:

- scheduling;
- referrals;
- task/follow-up workflows;
- care relationships;
- patient self-service where appropriate;
- clinic/team activity views;
- patient education and longitudinal adherence/monitoring workflows.

These operational capabilities should support the clinical workspace, not distract from it.

### Phase M — Production Platform Hardening & Interoperability

Objectives:

- complete unresolved schema-version coverage;
- finalize catalogue persistence decision and implement only after explicit owner approval;
- strengthen audit/decision-record persistence;
- strengthen atomic publication/rollback;
- mature identity/provider integration as required;
- improve interoperability/export/import contracts;
- revisit PostgreSQL only if a separately approved architecture decision demonstrates a need.

### Phase N — Continuous Clinical Validation & Product Learning

This is ongoing, not a final one-time phase.

- clinician-approved golden cases;
- specialty-specific validation panels;
- prospective usability feedback;
- false-positive/alert-fatigue monitoring;
- AI evaluation and regression benchmarks;
- evidence-update review cycles;
- medication-market refresh cycles;
- safety incident review;
- controlled feature rollout/rollback;
- real-world workflow metrics without exposing health data in inappropriate analytics.

---

## 17. Dependency order

The default order is:

```text
A Safety/Roadmap control
  ↓
B Longitudinal Patient Core
  ↓
C Visual Touch-First Workspace
  ↘
   D Medication Intelligence
    ↘
     E Evidence + AI Copilot
      ↘
       F Module Framework + Smart Routing
        ↓
       G Diabetes Reference Migration
        ↓
       H Initial Clinic-Ready Core Release
        ↓
       I/J/K Clinical Domain Expansion (incremental)
        ↘
         L Practice/Patient continuity expansion
          ↘
           M Platform hardening/interoperability

N Validation/Product Learning runs continuously across all phases.
```

Some work in C, D, and E may proceed in parallel **only** after their shared Patient Clinical Core contracts are stable enough to avoid duplicate schemas or unsafe rework.

---

## 18. Clinical domain activation checklist

A clinical module is not release-eligible until the relevant checklist is satisfied.

- [ ] Scope and intended users defined.
- [ ] Named evidence authorities defined.
- [ ] Evidence/legal/licensing use reviewed.
- [ ] Medication catalogue coverage reviewed.
- [ ] Required/safe-minimum patient facts defined.
- [ ] Missing/stale/unknown behavior defined.
- [ ] Rule precedence defined.
- [ ] Hard blocks/cautions/preferences/display/cost kept separate.
- [ ] Medication eligibility integration defined.
- [ ] Cross-domain interactions/conflicts reviewed.
- [ ] Explainability/provenance implemented.
- [ ] Deterministic tests implemented.
- [ ] Boundary/adversarial tests implemented where applicable.
- [ ] Clinician-approved golden cases established.
- [ ] UI/interaction reviewed with target physicians.
- [ ] AI context/prompts/evaluation added without granting AI authority.
- [ ] Rollback/deactivation path defined.
- [ ] Release claim reviewed.

---

## 19. Patient Core migration checklist

Any Patient Record v2 → Patient Clinical Core v3 migration must prove:

- no silent patient merge;
- no loss of practice scoping;
- no weakening of RBAC;
- no loss of immutable/revision history where already guaranteed;
- no loss of identifiers/file-number semantics;
- no duplicate canonical facts introduced by migration;
- backward-compatible reads or explicit version migration;
- old clients/routes fail safely during compatibility period;
- data provenance retained;
- rollback strategy documented and tested.

---

## 20. UX acceptance framework

The redesign is not complete merely when screenshots look modern.

Measure at least:

### Efficiency

- taps/clicks for frequent tasks;
- time to identify current major problems;
- time to reconcile a medication;
- time to review important lab changes;
- time to reach an evidence explanation;
- amount of mandatory typing.

### Cognitive load

- number of simultaneously competing alerts;
- number of navigation transitions;
- information density at first view;
- ability to identify the highest-priority issue quickly.

### Input modality

- touch-only completion;
- stylus usability;
- keyboard/mouse usability;
- tablet portrait/landscape behavior;
- desktop behavior.

### Clinical clarity

- unknown vs absent distinction;
- stale vs current data distinction;
- recommendation vs hard exclusion distinction;
- AI suggestion vs deterministic rule distinction;
- evidence/source visibility.

---

## 21. AI evaluation framework

AI quality must not be measured only by conversational fluency.

Evaluate:

- factual grounding in the patient chart;
- citation/source correctness;
- omission of unsupported claims;
- correct identification of missing information;
- contradiction detection;
- resistance to prompt/context contamination;
- privacy/access-boundary adherence;
- clinical usefulness rated by physicians;
- consistency across supported languages;
- safe behavior when evidence is absent or conflicting;
- model-to-model regression when providers change.

---

## 22. Architecture decisions that remain separate owner gates

The approved product direction does **not** automatically resolve unrelated infrastructure decisions.

### Catalogue persistence

The existing ADR proposing D1 consolidation with generated Git-JSON read artifacts remains a separate explicit owner decision. Do not implement the migration merely because this roadmap is approved.

### PostgreSQL

PostgreSQL remains an architecture foundation, not the current runtime authority. Do not move patient/clinical runtime to PostgreSQL without a separate approved decision and migration justification.

### External AI providers

Provider additions/replacements remain implementation decisions subject to privacy, security, cost, capability, and evaluation review.

---

## 23. Compatibility policy during transition

- Preserve stable patient/practice runtime contracts unless migration requires versioning.
- Keep `/type-1`, `/type-2`, and `/pregnancy` compatibility routes while Diabetes-module migration is underway.
- Keep current Type 2 clinical authority stable during UI/architecture refactors unless a separate clinical-authority task explicitly changes it.
- Preserve patient Care Hub separation from physician/assistant shell.
- Preserve current practice-local clinical-record semantics.
- Do not remove legacy compatibility code merely for aesthetic cleanup without proving no active consumer.

---

## 24. Engineering execution rules

Every significant implementation task must:

1. re-read this roadmap and current-state/authority docs;
2. identify affected Patient Core, Medication, Evidence, AI, module, and runtime boundaries;
3. perform a PRE dependency/graph review when graph-relevant;
4. avoid unrelated clinical-value changes;
5. include focused regression tests;
6. run whole-monorepo validation required by repository policy;
7. perform POST dependency/graph review when applicable;
8. document compatibility/migration impact;
9. use an independently reviewable PR;
10. update current-state/roadmap documentation when the factual state changes.

### No invented clinical values

Never create a threshold, contraindication, dose rule, monitoring interval, treatment objective, evidence claim, or medication status merely to complete a roadmap checkbox.

### Behavior-preserving refactors

Patient-core, UI, shared-architecture, and module-framework refactors must preserve established clinical behavior unless the task is explicitly a reviewed clinical change.

---

## 25. Recommended next implementation tasks

The next product-engineering sequence is:

### Task B1 — Patient Clinical Core architecture inventory

Map current Patient Record v2, workspace read models, observations, medication reconciliation, patient identity, practice contexts, encounter/snapshot contracts, and documents to the proposed Patient Clinical Core.

**Output:** gap matrix + migration ADR; no behavior change.

### Task B2 — Canonical Clinical Fact / Context contracts

Introduce versioned shared contracts for cross-domain facts, freshness, provenance, and Clinical Context without duplicating current storage.

### Task B3 — Longitudinal read model + change detection

Create the shared read model needed by Clinical Brief, What Changed, Smart Routing, and AI context.

### Task C1 — Visual Patient Workspace shell prototype

Build a behavior-preserving shell using existing patient data:

- Patient Strip;
- Clinical Brief region;
- What Changed;
- Problems;
- Medications;
- Trends;
- Clinical Modules launcher;
- contextual AI drawer.

### Task C2 — Touch/pen component standard

Create and test reusable clinical interaction components before reworking disease-specific intake forms.

### Task D1 — Medication Intelligence gap audit

Map the existing large medication catalogue, clinical safety registries, dose rules, Iranian market data, insurance, cost, and regimen logic into the target shared Medication Intelligence model.

### Task E1 — Evidence/AI generalization audit

Map Evidence Assistant and AI provider infrastructure to patient-context chart Q&A, source-linked answers, and draft actions without altering clinical authority.

### Task F1 — Clinical Module contract

Define the interface that Diabetes and all future modules must follow.

Only after these foundations should the current diabetes UI be migrated into the new module shell.

---

## 26. Definition of a successful first clinic-ready GLYMIZE

The first clinic-ready release does **not** need every internal-medicine specialty to have complete treatment logic.

It is successful when a physician can:

1. open the practice;
2. find/open a patient quickly;
3. understand the patient in seconds;
4. see what changed;
5. review problems, medications, allergies, labs, and trends without hunting through menus;
6. interact mainly by touch/pen and structured choices;
7. ask the AI clinically relevant questions about the current chart and see grounded sources/context;
8. use reviewed Medication Intelligence;
9. use Diabetes as a mature active decision-support module;
10. see other domains/lenses only at the maturity actually supported;
11. convert a reviewed insight into a physician-confirmed next action;
12. leave a clear longitudinal plan for the next encounter.

That is the product baseline on which Kidney, Cardiovascular, Pulmonary, GI/Hepatology, Infectious Disease, Neurology, Rheumatology, Hematology, and later domains should be added incrementally.

---

## 27. Final North-Star statement

> **GLYMIZE should become the physician's visual, patient-centered clinical workspace: one longitudinal record, one medication intelligence layer, evidence-grounded AI, modular specialty decision support, and the shortest possible path from patient context to safe physician-confirmed action.**
