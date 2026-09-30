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

## 0. Owner model checkpoint and token policy — 2026-09-11

**Current September 30 checkpoint: B2 partial native harness; B2 remains open.** [KC1 selection and exact framing](architecture/KEY_CUSTODY_R30_04_B2_PROTOCOL_V1.md) remains the contract. The [isolated KC1 harness](R30_04_B2_KC1_PARTIAL_HARNESS_2026-09-30.md) now tests its parser/crypto vector, Windows key page/DPAPI, manifest inventory and close-before-clear failure ordering; it has **no product linkage or accepted persistent recovery**. The [SQLCipher memory proposal](R30_04_B2_SQLCIPHER_MEMORY_REMEDIATION_PROPOSAL_2026-09-30.md) is not a fix: OFF removes general allocator sanitization and remains blocked. **Continue Sol High / medium relative token cost** for safe immutable publication, real SQLCipher generation/restore, independent AEAD interoperability and missing failure/recovery tests. Pause only at the later model transition for bounded Astra High review of exact memory/persistence evidence before B2 closes. Earlier checkpoint paragraphs below are historical evidence, not the current queue.

**OPS-GIT-01 — September 30 repository branch governance:** [GitHub cleanup and staged-flow evidence](GITHUB_BRANCH_GOVERNANCE_2026-09-30.md) records exactly `main`, `developer` and `feat/r30-04-b1-sqlcipher` as the three persistent remote branches. The owner confirmed that public visibility is intentional until a later decision. Every branch is therefore publicly readable and must contain no secrets, patient data or developer-only confidential material. An active no-bypass ruleset protects `main` and `developer` from deletion, force-push and direct updates; normal integration is `feat/<task>` or `feature/<task>` → PR to `developer` → PR from `developer` to `main`. The validation workflow enforces this lineage after it reaches the target branches. This governance task changes no clinical/runtime behavior, Roadmap completion state or RC/production deployment.

**September 21 historical packet: R30-03-C2 clean-Windows acceptance closure / Sol High / medium relative token cost.** The hash-bound reference-only Windows candidate passed Preflight, offline Install, real reboot, UninstallReinstall and Finalize on a clean non-elevated Windows 11 x64 VM with no developer toolchains and its virtual NIC disconnected. The sanitized evidence is committed at [R30-03-C2 clean-VM acceptance](evidence/R30_03_C2_CLEAN_VM_ACCEPTANCE_2026-09-21.json). This closes only the reference-shell C2 gate; it does not provide encrypted PHI, local authentication, signing, full clinical/offline operation, migration, provider activation or production acceptance.

**Current product/UI position.** C1 Visual Patient Workspace is an implemented foundation on RC: patient context, ten-second brief/completion surfaces, current/source/history presentation and governed Type 2 handoff exist. C2 touch/pen/accessibility standard remains partial, and observed physician usability remains R28-09. R30-03 now has an installed Windows reference-only candidate with real local search, no privileged IPC/online auth and accepted clean-VM/full-blackout evidence. It is not protected offline operation or a signed release.

**September 28 implementation packet: R30-04-B1 / Sol High.** The isolated [Windows SQLCipher synthetic-data spike](R30_04_B1_SQLCIPHER_SPIKE_2026-09-28.md) passed pinned native build, correct/wrong/no-key, tamper, indexed lookup, WAL crash recovery, side-file canary and encrypted-backup gates. It is not linked to Tauri, stores no PHI and activates no runtime/migration; R30-04 remains open.

**September 28 B2 prerequisite progress; B2 remains open.** [The review](architecture/KEY_CUSTODY_R30_04_B2_REVIEW.md) corrected B1's binary-passphrase/raw-key claim. [Corrective raw-key proof](R30_04_B2_RAW_KEY_PROOF_2026-09-28.md) now passes independent interoperability and backup-negative tests; historical evidence stays intact. **Continue Sol High / medium relative token cost** for bounded Windows-memory/Stronghold feasibility probes. Then pause for bounded Astra High exact-protocol finalization before Sol High persistent custody implementation. No patient IPC, authentication, PHI or production activation.

**September 29 B2 prerequisite probes complete; B2 remains open.** [Windows memory and Stronghold feasibility evidence](R30_04_B2_MEMORY_STRONGHOLD_FEASIBILITY_2026-09-29.md) reproduces the SQLCipher stderr stack overflow and 488 file-logged `VirtualLock` failures on a non-elevated host. Native Stronghold-to-SQLCipher raw-key application, snapshot reload and bounded allocations pass, while also proving that clearing Stronghold cannot revoke an already-keyed SQLCipher handle. RustSec reports zero vulnerabilities plus two unsuppressed transitive unmaintained warnings. **Pause for Astra High** to select the dependency and exact memory/KDF/custody/recovery protocol; no production policy, runtime activation or B2 completion follows from the probes.

**Historical September 16 packet: R29-05-B / Astra Medium / medium token cost.** Type 2 regression verification and reviewed publication completed before R29-05-C. Its Pages Preview exclusion was independently rechecked. Build-local indexes/calendar reuse and component-local insurance filtering preserve clinical semantics. One browser integration wait and the real-market test use explicit 15s correctness limits after measured cold-run variance; this is not latency-SLO acceptance. The September 20 checkpoint above supersedes its unresolved-deployment wording.

Owner approved R29, R30 and this workflow in the continuation conversation. Implementation approval persists across chats; environment activation and existing release gates remain distinct. Recommendations below are task-routing judgments, not measured quota multipliers. Agents cannot infer the active reasoning setting from their model identity or claim to switch the owner's model without an exposed control.

Before each implementation packet, display in Persian:

```text
MODEL CHECKPOINT
تسک: <ID and bounded packet>
مدل پیشنهادی: <model / reasoning>
دلیل: <one sentence>
مصرف نسبی توکن: <کم / متوسط / زیاد; no invented numeric estimate>
```

The initial `ادامه تسک` authorizes the announced packet. When the next packet requires a different model/effort, show this checkpoint and stop BEFORE its processing; the owner switches the selector and sends `ادامه تسک`. Do not repeatedly pause between tasks with the same recommendation. If the setting is not observable, rely on the owner's continuation after the announced checkpoint; never claim it was verified. Continue all approved in-scope edits, focused tests and documentation autonomously within the packet.

Default from 2026-09-20: Sol High replaces Astra Medium for implementation packets. Astra Light may still be used for purely mechanical documentation/lint. Astra High remains limited to a bounded security, authority, consistency or architecture review; pause before switching model or reasoning level and wait for the owner's continuation. Sol Extra High is not a default and requires its own checkpoint plus a concrete reason that High is insufficient. No automatic subagents. Retrieve targeted graph/source evidence, run focused checks first and full gates once when required. Keep `ACTIVE_TASK_HANDOFF.md` concise; suggest context compaction at milestones. A fork copies context and is not inherently a token saving. Token/credit use varies with context, reasoning and tools; never promise an exact weekly-quota saving.

**R29-05-A local checks passed:** [rollout/rollback evidence](R29_05_A_LOCAL_ROLLOUT_2026-09-15.md), 18 matrix rows; Worker 354, web 328 and engine 443 tests pass sequentially; typecheck/lint pass. Earlier parallel timing failures are disclosed. Remote RC acceptance remains not run. **Next: publication safety resolution, then R29-05-B RC readiness planning / Astra Medium / medium relative token cost.** Owner approved reviewed Commit/Push without Deploy, but Pages previews all branches: Push is blocked until explicitly authorized branch-setting remediation and trigger recheck. No deployment, migration or main merge. Same-model continuation needs no renewed scope approval. All five R29 items and protected offline obligations remain scheduled.

## 1. Product North Star

R29-05-B — 2026-09-15: [RC readiness and Type 2 CI repair](R29_05_B_RC_READINESS_AND_TYPE2_FIX_2026-09-15.md). Previous checkpoint is on GitHub with confirmed skipped Pages build/deploy. Populated-market E2E regression is addressed with semantics-preserving build-local indexes/calendar reuse; full verification and repair publication pending. Remote target must be pinned by active-version bindings; plan ceilings/isolation/candidate deployment remain unverified. Continue Astra Medium for bounded repair/CI verification, no deployment until destination and gates are resolved. All R29 and protected-offline obligations remain scheduled.

Publication follow-up — 2026-09-15: implementation checkpoint 7892284 committed. Owner-approved exclusion of only the current fix branch from Pages Preview is applied and GET-verified; main and other source fields unchanged. GitHub validation-only PR #143 has auto-merge off. Workers Builds API 403 was handled with read-only account inventory and both GLYMIZE Workers' disconnected Git settings in the dashboard. See the R29-05-A report follow-up; it supersedes the previous publication blocker. Push verification is separate from deployment/RC acceptance; next technical packet remains R29-05-B / Astra Medium.

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

When an Offline Clinic candidate is in release scope, Phase H also requires the
§16.1/R31 acceptance slice appropriate to that candidate: offline-media install
on a clean Windows VM, explicit Local Only versus Cloud-linked authority,
encrypted-store and backup/restore evidence, shared Clinical Engine/evidence
parity, and—where Clinic Host is enabled—trusted HTTPS pairing plus separate
Android and iOS PWA evidence. A browser-only or simulated-offline smoke cannot
close those gates.

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

## 16.1 GLYMIZE — Offline Clinic & Local Intelligence

**Status:** owner-approved cross-cutting product direction; roadmap/Proposed ADR recorded. R30-03-C2 reference-shell clean-VM acceptance is complete; protected offline-clinic implementation and R31 acceptance remain pending.

**Architecture companion:** [Proposed Offline Clinic & Local Intelligence ADR](architecture/OFFLINE_CLINIC_LOCAL_INTELLIGENCE_ADR.md).
**Position in the roadmap:** this is not a detached final phase. It is an integration program across Patient Core (B), Practice/Patient Workspace (C/L), Evidence and AI (E), Clinical Modules (F/G), Clinic-Ready Acceptance (H/N), Production Hardening (M), R29 resource work and R30 local-first infrastructure.

### 16.1.1 Current-state connection and non-duplication rule

Reuse the existing architecture:

- Worker/D1 Patient Record v2 remains the implemented patient/encounter runtime authority until each local adapter and authority transition passes R30/R31 gates;
- Patient Clinical Core projections/contracts remain the shared context for UI, Clinical Modules and AI; no second patient model or store is introduced as an application-level authority;
- Decision Graph v2 remains physician-facing Type 2 selection/ranking authority; the same reviewed clinical engine/rule bundles execute offline and online;
- Evidence Assistant retrieval and Evidence Platform governance remain the citation/evidence boundary;
- Local AI is a provider/runtime behind the existing Copilot abstraction, not a new independent assistant or medical authority;
- additive central Patient Identity and practice-local Patient Record remain distinct; offline identifiers are mapped through reviewed links, never silent merges;
- Patient Portal/patient sessions remain a separate trust domain from clinician/care-team authentication;
- the existing Tauri 2 shell, PWA assets, SQLite direction, R29 measurements and R30 sync/grant/update plans are extended rather than restarted.

This section records target behavior only. It does not complete R29 or any R31 task, and it changes no current clinical/runtime behavior. R30-03-C2 was completed later by independent real-VM evidence; that closure does not broaden this section's authority.

### 16.1.2 Product invariants

1. A clinic may intentionally remain **Local Only** indefinitely. Accepted local workflows must not require GitHub, Cloudflare or initial Internet access.
2. Cloud Sync is opt-in. Local Only and Cloud-linked clinics have explicit, different trust/identity states.
3. A locally created physician account is a local clinic owner/actor; it is not centrally verified professional identity until a separate online verification/enrollment succeeds.
4. A clinic has one operational clinic database. LAN/mobile clients use the Clinic Host; they do not create independently writable patient databases.
5. Internal patient, encounter and operation identity uses random UUIDs. National ID, foreign-resident ID, passport+issuing-country and temporary local identifiers are typed aliases. Never manufacture a national-ID-looking value such as a `0000` prefix.
6. Local and cloud execution share contracts, clinical rules, evidence objects and confirmation boundaries. Storage/transport adapters may differ; clinical meaning may not.
7. AI cannot write canonical facts, alter Clinical Authority or execute treatment actions without physician confirmation. AI failure cannot stop record management or deterministic clinical rules.
8. Device pairing QR and patient-transfer QR are different protocols and namespaces. Scanning alone never grants patient access.
9. Clinical sync conflicts preserve both histories and require reviewed resolution; no automatic last-write-wins for facts, identity links, signed plans or orders.
10. RC/production isolation, patient/practice scope, RBAC, append-only/revision history, migration compatibility and rollback evidence remain mandatory.

### 16.1.3 Twelve-axis integration map

| Axis | Reused owner tasks / additive task | Phase connections | Acceptance boundary |
| --- | --- | --- | --- |
| **A. Offline Desktop Application** | R30-03 and R30-08; R31-01 | C, H, M | R30-03-C2 accepts the reference-only shell's removable-media/clean-Windows install, reboot and full-blackout behavior. Creating a protected Local Only workspace, permanent record operation, signing and optional later Cloud enrollment remain R30-04/07/08 and R31-01 work. |
| **B. Local Database** | R30-04/05/06; R31-01 | B, M | One encrypted clinic database covers the approved patient/encounter/diagnosis/medication/lab/history subset plus provenance, revisions, audit and outbox. Test WAL/journals/temp/attachments, interrupted migration, corruption, wrong/lost key and cross-practice access. R30-04-A selects the SQLCipher Community candidate; B1/B2 build/custody proof and integration remain open. |
| **C. Offline Authentication** | R30-07; R31-01 | B, L, M | First-install local owner, individual staff accounts, offline logout/re-login, RBAC, lockout and recovery work without Cloud. Cloud-linked grants retain revocation/expiry rules; Local Only authority is not falsely labelled centrally verified. Patient offline access uses a separately prepared encrypted subset and patient trust boundary. |
| **D. Patient Identity & Offline Patient Creation** | Existing Patient Record v2/P5 identity; R31-02 | B, L, M | Create local patients using internal UUIDs and typed real/temporary identifiers; preserve aliases/history during reviewed duplicate linking; test national-ID collision/checksum, foreign resident, passport+country, undocumented patient and later central mapping without silent merge or duplicate visit. |
| **E. GLYMIZE Clinic Host** | R30-05/06 and promoted R30-10; R31-03 | B, C, E, L, M | One host owns DB, narrow local API, auth/RBAC, PWA, deterministic engine, selected local-AI runtime and sync queue. Single-device mode works without network setup; multi-device writes converge through the host transaction boundary. |
| **F. QR Device Pairing & Local PWA** | R30-10; R31-04 | C, L, M | Separate network/bootstrap and pairing tokens; host identity plus short-lived authenticated challenge; physician approval and role assignment before data access. HTTPS/certificate trust, Service Worker scope and install/reconnect are independently tested on supported Android and iOS paths. Plain LAN HTTP is not accepted for protected PWA operation. |
| **G. Offline Patient Transfer** | R31-05 | B, L, M | Authorized, consented, scope-minimized encrypted package preserves UUIDs, revisions and provenance. QR carries bounded bootstrap/fingerprint material; file carries larger payload. Recipient authenticity, expiry, tamper/wrong-key rejection and idempotent re-import/sync prevent duplicate visits. Transfer QR cannot be parsed as pairing QR. |
| **H. Offline Clinical Engine** | R30-05/08; R31-06 | D, E, F, G, H, N | Same Decision Graph v2/Clinical Module/Evidence artifacts and input contracts produce parity for reviewed cases offline/online. Expose rule/evidence version/date, missing/stale state, hard exclusions and physician confirmation. No AI substitution or new rule/dose/threshold. |
| **I. Local AI integrated with Copilot** | R28-08/E1; R31-07 | E, H, N | Evaluate provider/runtime/model candidates before selection for Persian/English grounding, citations, safety, prompt contamination, RAM/VRAM/CPU, latency, package size, hardware tiers and redistribution license. Supported local AI may summarize/Q&A/explain/retrieve/draft; failure falls back to deterministic/extractive operation. No Qwen, Ollama, llama.cpp or other candidate is preselected. |
| **J. Optional Cloud Synchronization** | R30-06; R31-08 | B, L, M, N; R29 cloud measurements | Durable outbox/inbox, idempotency, acknowledgements, delta/tombstone/base revision and conflict UI survive crash/retry/reorder. Local work stays until acknowledged. Show last sync/backlog/conflicts; warn weekly when eligible unsent work exceeds seven days, but suppress sync warnings in intentional Local Only mode. |
| **K. Local Backup & Recovery** | R30-04/08; R31-09 | H, M, N | Offline encrypted backup, restore and workspace relocation recover unsynced data, attachments, revisions, audit/outbox and required key metadata. Test replacement device, wrong/lost key, corruption, interrupted restore/migration and revoked/cloud-linked state without requiring Internet. |
| **L. Offline Distribution & Acceptance** | R30-08/09, R28-09/R29-05 final gates; R31-10 | H, M, N | Exact signed/versioned candidate on a clean offline Windows VM: removable-media install, local account/patient/visit, deterministic engine, one supported local-AI tier, restart/re-login, QR-hosted PWA, care-team use, transfer, backup/restore and later sync. Android/iOS paths are separate. No component is complete from a simulated substitute. |

PWA installability and Service Workers require a trusted secure origin; `localhost` exceptions do not make an arbitrary phone-to-LAN HTTP address acceptable. Clinic Host design must therefore solve HTTPS identity and certificate trust instead of instructing users to bypass warnings. The Windows installer continues to include the offline WebView2 standalone prerequisite. Standard Windows 11 acceptance records and reuses the OS-provided Runtime; a genuinely runtime-absent supported target must independently prove offline provisioning before that compatibility coverage is claimed.

### 16.1.4 Additive task backlog

These IDs are additive integration tasks. They do not renumber or replace R28–R30.

| ID | Scope | Dependencies | Acceptance and model checkpoint |
| --- | --- | --- | --- |
| **R31-01** | Define/implement Local Only vs Cloud-linked workspace profiles, local owner/staff authentication, database bootstrap and authority transition. | R30-03-C2; R30-04-A; R30-05/07 contracts | Astra High design, then Sol High implementation. Prove offline first install/re-login/RBAC/recovery and that local accounts are not centrally verified. |
| **R31-02** | Typed local patient identity, UUID/revision namespace, temporary/foreign/passport identifiers and later central matching/duplicate-link history. | Patient Record v2/Patient Core; R31-01; R30-05/06 | Astra High identity/conflict design, then Sol High. Collision, mapping, merge-history and idempotency matrix; no fake national ID or silent merge. |
| **R31-03** | Clinic Host process boundary: one DB, narrow local API, auth/RBAC, PWA/engine/AI adapters and sync queue; single-device mode is the first slice. | R30-04/05/07; R31-01/02 | Astra High boundary/threat design, then Sol High. No arbitrary SQL/file/HTTP capability; concurrent LAN clients preserve one transactional authority. |
| **R31-04** | LAN discovery, HTTPS identity/trust bootstrap, QR device pairing, role approval and local PWA lifecycle. | R31-03; R30-02/03/10 | Astra High security design, then Sol High. Independent Windows-host/Android/iOS tests; replay/expired/wrong-host/role-change/offline-reconnect negatives. |
| **R31-05** | Offline patient-transfer export/import protocol, authorization/consent, encrypted package and deduplication. | R30-04/05; R31-02/03 | Astra High security/identity design, then Sol High. Tamper/wrong recipient/re-import/later-sync/duplicate-visit and QR-namespace tests. |
| **R31-06** | Versioned offline Clinical Engine, Clinical Module, medication and approved-evidence bundle parity. | R30-05/08; existing engine/evidence release gates | Sol High implementation; short Astra High authority audit if bundle policy changes. Exact golden/parity cases, version/freshness/source UI and unchanged hard-exclusion/confirmation evidence. |
| **R31-07** | Local-AI candidate benchmark, license/distribution review, hardware tiers and provider integration into existing Copilot. | E1/R28-08 privacy boundary; R31-03/06 | Sol High evaluation harness; Astra High safety/provider-selection review before activation. No model/runtime default until measured and licensed. AI-off/failure/extractive fallback and bilingual citation tests. |
| **R31-08** | Optional Cloud Sync protocol, identity mapping, durable outbox/inbox, conflict UI and seven-day warning policy. | R30-06; R31-01/02/03; Worker/D1 command parity | Astra High consistency design, then Sol High. Crash/retry/reorder/duplicate/tombstone/revocation/concurrent-clinic tests; Local Only has no sync nag. |
| **R31-09** | Encrypted backup, restore, key recovery and workspace relocation independent of Cloud. | R30-04/08; R31-01/03/08 | Astra High key/recovery design, then Sol High. Restore unsynced data on replacement hardware; wrong key/corruption/version/revocation fail safely. |
| **R31-10** | Offline-clinic release matrix and removable-media distribution bundles, including selectable clinical/evidence/local-AI packs by supported hardware tier. | R30-08/09; R31-01 through R31-09; R28-09; R29-05 final evidence | Sol High execution; bounded Astra High final audit. One exact candidate SHA and signed hashes; real clean VM plus separate Android/iOS acceptance. |

### 16.1.5 Revised execution order

1. Publish this documentation/ADR packet; no runtime change.
2. **Completed 2026-09-21:** real **R30-03-C2** clean-Windows execution on Sol High; all five phases passed and Finalize returned `accepted=true` for the externally pinned manifest.
3. **R30-04-A and completed B1/B2 prerequisites retained:** [KC1/native selection](architecture/KEY_CUSTODY_R30_04_B2_PROTOCOL_V1.md) consumes the completed remediation/KDF matrix. The [partial native harness](R30_04_B2_KC1_PARTIAL_HARNESS_2026-09-30.md) exercises primitives and a read-only synthetic inventory; Sol High still owes safe persistent publication, SQLCipher DB/recovery and independent interoperability tests. The [memory proposal](R30_04_B2_SQLCIPHER_MEMORY_REMEDIATION_PROPOSAL_2026-09-30.md) needs executable remediation evidence and Astra review before B2 closure. C integration follows B2 and R30-05/07 contracts. No protected runtime accepted; R31 cannot bypass these gates.
4. Design then implement R31-01/R31-02 with R30-04/05/07: local workspace, local RBAC and identity/revision foundations.
5. Implement R31-03/R31-04 with promoted R30-10: single-host first, then trusted LAN/PWA pairing with independent Android/iOS gates.
6. Implement R31-06 before Local AI so deterministic clinical/evidence bundles remain the authority; then evaluate/integrate R31-07 through the existing Copilot boundary.
7. Implement R31-05 transfer and R31-08 synchronization only after crypto, identity and host command contracts stabilize.
8. Implement R31-09 recovery before release acceptance.
9. Close R31-10/R30-09/R28-09 and the installed-product portion of R29-05 only on one exact candidate with real blackout/recovery/LAN/mobile/sync evidence.

R29-01 through R29-05 remain open wherever RC CPU/latency/rows, eligible cache activation, D1 replication/bookmarks, query/index benefit, Turnstile/Smart Placement or final rollback evidence is missing. D1 replication optimizes eligible cloud reads; it is not the local SQLite sync protocol. R29-02 public caches are not the encrypted operational clinic database. Provider work may proceed independently when its own gates are met, but it cannot close the offline-clinic release gate.

### 16.1.6 Final end-to-end acceptance scenario

On one exact signed/versioned candidate, start with a clean Windows VM with no Internet and no preinstalled WebView2/runtime dependencies. Install from removable media, create a Local Only clinic owner and workspace, restart and re-login, add role-scoped staff, create a patient using each supported identifier class, record an encounter/diagnosis/medication/lab/history, run Decision Graph/Clinical Engine and one supported local-AI tier, inspect evidence/version/provenance, pair an Android client and an iOS client through separately accepted HTTPS/PWA paths, use care-team RBAC, export/import an authorized patient package without duplication, back up and restore unsynced work, then enable connectivity and prove idempotent sync/conflict behavior. Every unavailable or unsupported step fails visibly without false success.

No individual task or final scenario is complete from roadmap text, mocked provider output, browser-only smoke or file existence.

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

§16.1 Offline Clinic & Local Intelligence is cross-cutting rather than a new
terminal phase: it binds B/C/E/H/L/M/N and the R29/R30 foundations. Its ordering
is controlled by §16.1.5; later clinical-domain expansion does not need to wait
for every R31 task, but no Offline Clinic release claim may bypass its applicable
identity, storage, clinical-authority, recovery, LAN/mobile or sync gates.
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
- model-to-model regression when providers change;
- Persian and English quality on locally supported hardware tiers;
- CPU, RAM, VRAM, latency, power and package-size budgets;
- artifact provenance, license and offline-redistribution/update rights;
- grounded citation fidelity under missing, stale and conflicting evidence;
- AI-disabled, model-load-failure and extractive-fallback behavior.

---

## 22. Architecture decisions that remain separate owner gates

The approved product direction does **not** automatically resolve unrelated infrastructure decisions.

### Catalogue persistence

The existing ADR proposing D1 consolidation with generated Git-JSON read artifacts remains a separate explicit owner decision. Do not implement the migration merely because this roadmap is approved.

### PostgreSQL

PostgreSQL remains an architecture foundation, not the current runtime authority. Do not move patient/clinical runtime to PostgreSQL without a separate approved decision and migration justification.

### External AI providers

Provider additions/replacements remain implementation decisions subject to privacy, security, cost, capability, license/redistribution and evaluation review. R31-07 owns the local-provider candidate matrix and hardware tiers. No Qwen, Ollama, llama.cpp or other model/runtime name in an older design note is an approved default until measured evidence and the owner gate select it.

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


---

## 28. Snapshot-based project review and proposed follow-up — 2026-09-09

**Status:** Owner-authorized execution backlog; R28-01 complete.

**Reviewed source:** `main@5673eb92f146d2951531acdfd511509b0da18a65`.  
**Scope of this update:** append analysis and recommendations to this Roadmap only. Existing phase definitions, completed work, clinical authority and separate owner decisions remain unchanged.

**Execution authorization — 2026-09-09:** the owner authorized sequential implementation on `main`, with each completed section pushed to GitHub and no external deployment. Physician sign-off is not a prerequisite for implementing the private initial build; physician evaluation remains tracked separately from repository implementation and environment activation.

### 28.1 Evidence and limits

The downloaded `codebase-memory-snapshot.tar.gz` from the private `codebase-memory-latest` release was opened and its SQLite graph queried read-only after decompression. Its SHA-256 matched the published checksum:

`55bec4f0f31acc209423ebee2c8843177d0b6e53db414af145fe29f241cd1006`

Both `snapshot-source.json` and `artifact.json` identify the reviewed source SHA. Provenance: Codebase Memory `0.10.8`, workflow run `34292864232`, graph generation `2026-09-08T23:57:33Z`. The source graph contains **7,112 nodes and 27,317 edges**, excluding the separate missed-coverage graph. These are navigation counts, not product-quality or test-coverage scores.

The available workstation MCP index was older (coverage generation `2026-09-07T08:39:31Z`); its coverage check reported missing or changed evidence paths. Consequently, findings below use the canonical downloaded graph and exact-SHA GitHub source instead. Relevant incoming/outgoing call edges and recorded file coverage were inspected in the snapshot. The directly cited Patient Core/workspace files have hash records and no recorded coverage gaps; this is best-effort evidence, not proof of exhaustive indexing. The snapshot records 22 partially parsed files overall. No migration-safety conclusion is drawn from those files.

This was a bounded architecture/readiness review centered on the current patient workflow, not a full security, clinical, performance or production audit. Existing test source was read; tests, builds, RC acceptance and deployments were not run. Potential runtime failure scenarios below require reproduction before being reported as confirmed incidents.

### 28.2 Current assessment: extend the implemented path

The strongest foundation is the existing separation between practice-local patient persistence, shared contracts, deterministic clinical authority and the physician-facing projection. The reviewed source already contains:

| Roadmap area | Evidence-backed present state | Remaining distinction |
| --- | --- | --- |
| B1 inventory/ADR | The [Patient Clinical Core inventory index](architecture/PATIENT_CLINICAL_CORE_README.md) and companion inventory, gap matrix and migration ADR exist. | Do not restart the inventory; reconcile it with subsequent implementation. |
| B2 contracts | `packages/contracts/src/patient-core/` defines fact, provenance, context, collection and longitudinal contracts. | Typed contracts alone do not establish authoritative coverage for every data family. |
| B3 longitudinal read/change model | [read-model.ts](../apps/admin-worker/src/patient-core/read-model.ts) combines existing readers and [change-detection.ts](../apps/admin-worker/src/patient-core/change-detection.ts) compares scoped snapshots. | The model remains partial in several families; preserve its no-false-removal behavior. |
| C1 workspace | `/patients/[patientId]`, the [clinical brief](../apps/web/lib/patient-clinical-brief.ts), trends, a module launcher and an AI drawer exist. | UI presence is not full C1 usability acceptance, module-context integration or patient-aware AI. |
| Patient data | [projection.ts](../apps/admin-worker/src/patient-core/projection.ts) reuses Patient Record v2. | Allergies/problems are explicitly `not_available/source_not_exposed`; medications come from the current snapshot; legacy contexts are explicitly partial. |
| Module/AI entry | [C1 completion surfaces](../apps/web/app/patients/_components/patient-workspace-c1-completion.tsx) expose navigation and context counts. | Module links deliberately omit automatic patient handoff; the drawer deliberately sends no patient data to Evidence Assistant. |

**Recommendation:** make the existing patient journey reliable, source-traceable and measurably useful before adding more specialty surfaces. B1/B2/B3/C1 should be treated as implemented foundations with specific remaining acceptance work, not collectively marked either “not started” or “complete.”

### 28.3 Prioritized proposed tasks

Priorities here are review priorities: **P0** = resolve before extending the affected patient-data path; **P1** = next convergence work; **P2** = dependent capability. Task IDs are additive and do not renumber the canonical phases or the B1 inventory's local B2–B8 sequence.

#### R28-01 — Reconcile roadmap status and task identifiers

- **Priority / phase:** P0; A, supporting B–H.
- **Evidence:** §25 still lists B1/B2/B3/C1 as next tasks, while the implementation above exists. The [B1 gap matrix](architecture/PATIENT_CLINICAL_CORE_GAP_MATRIX.md) retains pre-B2 gaps, and [CURRENT_STATE.md](CURRENT_STATE.md) is dated before the new patient-core/workspace additions.
- **Proposal:** produce one small current-status crosswalk: canonical phase/task → existing source/PR → remaining gap → acceptance evidence → dependency. Map local B4/B5/B6 labels to canonical D/E/F to avoid executing two versions of the same task. Flag older architecture descriptions for a later factual documentation sync against accepted runtime ADRs.
- **Acceptance:** every B1/B2/B3/C1 entry distinguishes implemented foundation, remaining engineering, clinician review and environment activation. Historical checklists are retained. No feature becomes approved or production-ready merely through a status edit.
- **Dependency:** none. This review records the need; it does not edit the companion documents.
- **Execution status — complete (2026-09-09):** [`ROADMAP_STATUS_CROSSWALK_2026-09-09.md`](ROADMAP_STATUS_CROSSWALK_2026-09-09.md) records the canonical task/source/gap/evidence/dependency mapping, separates implementation, physician evaluation and activation states, and maps local B4/B5/B6 to canonical D1/E1/F1. `CURRENT_STATE.md` now points to that control document. No runtime or clinical behavior changed.

#### R28-02 — Bind asynchronous workspace responses to the active patient

- **Priority / phase:** P0; C1 hardening.
- **Historical pre-R28-02 evidence:** `load()` in [patient-clinical-workspace.tsx](../apps/web/app/patients/_components/patient-clinical-workspace.tsx) committed the response without a request-generation/identity check; its effect reran for `patientId`. [patient-clinical-core-client.ts](../apps/web/lib/patient-clinical-core-client.ts) cast JSON to the TypeScript contract. R28-02 added guards; R30-02 later relocated the workspace, hence the updated source link.
- **Risk to verify:** when requests overlap, a late response could replace newer state. Cross-patient manifestation depends on actual route/component lifecycle and must be reproduced, not assumed.
- **Proposal:** cancel/ignore obsolete reads, validate the response envelope/version and active patient/practice scope, and clear inaccessible context after logout, practice change or denied access.
- **Acceptance:** behavioral tests resolve A/B requests out of order, overlap refreshes, change the active context and return malformed/unsupported/mismatched responses. Only the active authorized context may render; no old result may overwrite it.
- **Dependency:** existing B2/B3 contracts; no new patient store.

#### R28-03 — Make read-model completeness an executable contract

- **Priority / phase:** P0; B3.
- **Evidence:** [observation-reader.ts](../apps/admin-worker/src/patient-core/observation-reader.ts) filters rejected/raw observations, skips unusable values/empty keys, and returns `completeness: "complete"`. Snapshot projection already tracks skipped unusable labs as partial. [read-model contract tests](../apps/admin-worker/test/patient-core-read-model-contract.test.ts) mainly inspect source strings and AAD helpers.
- **Proposal:** define the exact eligible observation universe and distinguish intentional exclusions, unavailable source, invalid skipped data and truncated results. Preserve unknown/partial state through the UI and downstream consumers.
- **Acceptance:** execute readers/routes against controlled data, including missing values, malformed payloads, excluded raw/rejected rows, latest snapshot revisions, decryption failure and another practice's patient. A skipped eligible fact cannot silently produce a complete projection; expected exclusions remain explicitly scoped. Preserve the existing change detector's rule that absence from a partial family is not a removal.
- **Dependency:** R28-01; no edits to applied migrations.

#### R28-04 — Align the brief, Attention Now and source drill-down

- **Priority / phase:** P1; C1/C2.
- **Evidence:** [buildPatientTenSecondBrief](../apps/web/lib/patient-clinical-brief.ts) counts flagged observations across the full collection; the workspace's Attention Now filters only the newest eight rows. Current display slicing also limits changes and timeline entries.
- **Proposal:** derive counts and displayed items from one declared selection contract. Separate current per-series observations from historical flags, expose verification/freshness, and provide expansion/source links for omitted items. Historical abnormal results should remain reviewable without being silently presented as today's finding.
- **Acceptance:** fixtures include an old flagged result followed by a newer normal result, repeated analytes, unverified observations, incompatible units/specimens and more items than each preview limit. Headline counts reconcile with expandable lists; every consequential item resolves to its source/revision. No new clinical threshold, severity class or automatic “resolved” interpretation is introduced.
- **Dependency:** R28-03 and the existing [C1 design contract](architecture/PATIENT_WORKSPACE_C1_10_SECOND_BRIEF.md).

#### R28-05 — Bound longitudinal reads and measure their cost

- **Priority / phase:** P1; B3 and H performance gate.
- **Evidence:** the observation reader selects all eligible history and awaits decryption row by row; [timeline-reader.ts](../apps/admin-worker/src/patient-core/timeline-reader.ts) limits encounters to 100 and explicitly marks the timeline partial.
- **Proposal:** measure query count, rows, decryption time, response bytes and end-to-end latency on synthetic longitudinal records before choosing optimization. Define bounded summary/history retrieval and continuation metadata so larger records remain fully inspectable.
- **Acceptance:** an agreed small/medium/large synthetic cohort has recorded latency and payload budgets; continuation has no duplicates or omissions under the declared revision semantics; summary limits cannot imply complete history. Any cache must include authorization scope and source version and respect revocation.
- **Dependency:** R28-03. This is not evidence that production is currently slow and does not justify a datastore migration.

#### R28-06 — Close Patient Core authority gaps before shared medication safety consumes them

- **Priority / phase:** P1; B convergence → D1/D.
- **Evidence:** allergies/problems are not exposed by the current projection; medication state is snapshot-derived; [provenance.ts](../packages/contracts/src/patient-core/provenance.ts) supports freshness states while current readers emit `unknown`.
- **Proposal:** extend the existing gap matrix with one authoritative source/write owner per allergy, problem, medication-reconciliation and cross-cutting-context family. Add adapters to existing sources where possible; introduce a new authority only through a separately reviewed gap/ADR. Carry source time, verification and reconciliation state into eligibility consumers.
- **Acceptance:** “not collected,” “known absent,” “unverified,” “stale” and “current” remain distinct. Freshness policies are reviewed and versioned per clinical use; no universal invented cutoff. Pre-visit medication state, physician decision and signed order remain separate. Missing safety facts never become implicit clearance.
- **Dependency:** R28-03; the existing D1 audit. Reuse current safety registries instead of creating a parallel medication engine.
- **Owner decision — 2026-09-10:** Option A is accepted: dedicated bounded longitudinal Allergy/Problem authority remains inside the existing Worker/D1 Patient Record v2 runtime of record.
- **Completion — 2026-09-10:** R28-06 is complete in repository history. Exact candidate `39a4fe2e4aa05d5447d12988252b76a0979fde02` passed local engineering gates, POST Roadmap + Graph Gate, and official PR CI run `34435784209` (#231), then merged through PR #139 as `main@a753b9b914df2039a92b293b2638a47d1f9a9eeb`. Migration `0019` remains unapplied; `PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ENABLED` remains default-off; backfill, clinical/freshness-policy changes and RC/production deployment remain separately gated.

#### R28-07 — Turn the module launcher into a governed context handoff

- **Priority / phase:** P1; F1 → G.
- **Evidence:** the C1 launcher has a local module list and maturity labels (`reviewed_cds`, `reviewed_tool`, `reference_only`), while §12 defines a broader canonical lifecycle. Its links intentionally do not transfer patient facts.
- **Proposal:** define an explicit mapping to the canonical lifecycle, then a small typed registry and reviewed Patient Core → module-input adapter. Keep registration, treatment authority and release eligibility separate.
- **Acceptance:** patient/practice identity, source revision and missing/unverified required inputs are checked at handoff; the clinician sees and confirms relevant facts. Type 2 equivalence and legacy routes remain intact. Demonstrate a second read-only domain registration without modifying Patient Core or claiming new treatment support.
- **Dependency:** R28-02/R28-06 and stable F1 contract. A UI maturity badge is not clinician sign-off.
- **Completion — 2026-09-10:** R28-07 is complete in repository history. Exact candidate `0af430a87aec5ca03607f4210e20d0d5f23528b9` introduced the typed §12 lifecycle/registry, separated registration from treatment authority and release eligibility, registered Type 1 as a second `read_only_context` proof, and added a governed revision-bound Patient Core → Type 2 handoff with explicit clinician confirmation while preserving Decision Graph v2 and the legacy handoff/route path. PR #141 exact-head validation run `34440472004` (#244) passed; the local exact-head POST Roadmap + Graph Gate passed; PR #141 merged as `main@f92aee7459ea5194d4b6dccbe3dc6a12f6ec6192`; direct-main validation run `34441361566` (#136) and Codebase Memory snapshot run `34441361551` (#63) passed. No clinical threshold, dose, ranking or treatment authority changed. Migration `0019` remains unapplied, its rollout remains default-off, and no RC/production deployment was performed.

#### R28-08 — Connect patient-aware AI through a constrained context boundary

- **Priority / phase:** P2; E1/E after core contract acceptance.
- **Evidence:** the existing C1 drawer explicitly leaves automatic context transfer disabled. It is a suitable integration point, not an already implemented chart-Q&A service.
- **Proposal:** define the minimal versioned context payload, server-side authorization/revalidation, source references, approved-provider policy and conversation lifecycle before connecting the drawer. Reuse the existing provider abstraction.
- **Acceptance:** patient/practice switches cannot reuse another context; tests cover permission revocation, missing evidence, contaminated document text, wrong-source citations and provider failure. Answers separate facts/rules/evidence/synthesis. Draft actions require current-context physician confirmation; AI never writes canonical facts or signs orders.
- **Dependency:** R28-02/R28-03/R28-06 plus the existing E1 privacy/evaluation work. No patient data transfer is enabled by this roadmap entry.

#### R28-09 — Build one evidence-based clinic-ready acceptance packet

- **Priority / phase:** P1 planning now; H/N acceptance before release.
- **Evidence:** §20/§21 already require usability and AI evaluation; the existing clinical stress investment and [remaining-roadmap re-baseline](REMAINING_ROADMAP_REBASELINE_2026-09-08.md) do not establish formal clinician-approved golden cases or production acceptance.
- **Proposal:** bind the release candidate SHA, approved module/rule/catalogue versions, named review owners, golden-case decisions, RC workflow evidence and environment capability state in one acceptance packet. Give each blocker an owner and measurable exit condition.
- **Acceptance:** observe representative physicians performing patient lookup → brief → reconciliation → evidence → confirmed action in Persian RTL and English LTR, with touch and keyboard. Record task success, time, navigation and misunderstanding of missing/stale data. Include scoped isolation/revocation checks, large-record performance, recovery/rollback evidence and explicit feature activation state. Agree numerical UX/operational targets before the pilot rather than inventing clinical efficacy claims afterward.
- **Dependency:** affected R28 tasks and existing H release gates. Safety, recovery and release-critical hardening from M must be satisfied wherever H already depends on them; broader interoperability and owner-gated migrations remain later work.

### 28.4 Suggested execution order and definition of completion

1. **R28-01:** reconcile current state and assign exact remaining work.
2. **R28-02/R28-03:** verify and harden patient binding and data completeness.
3. **R28-04/R28-05/R28-06:** finish the usable, bounded and source-traceable patient path.
4. **R28-07:** integrate the existing reviewed Diabetes module through an explicit context contract.
5. **R28-08:** enable curated patient-aware AI only after its dependencies and evaluation gates pass.
6. **R28-09:** collect acceptance evidence throughout; close the release gate only for the exact reviewed candidate.

For each proposed task, “done” requires its focused behavioral evidence and the repository's applicable engineering gates, not a checkbox inferred from file existence. This review does not authorize implementation of these proposals, specialty activation, catalogue migration, PostgreSQL migration or deployment.

## 29. Resource efficiency and consistent reads — owner approved 2026-09-11

R29-04-E progress — 2026-09-14: [local implementation](R29_04_E_HISTORY_SCOPE_2026-09-14.md) adds independent default-OFF history scope lookup, shared exact registry SQL, unchanged full summary and explicit unrelated-error isolation. Eight flag/family combinations preserve successful payloads; 6 → 3 route queries in fixtures. Worker 352 tests/typecheck/lint passed. Provider CPU/rows/latency, index selection and RC remain pending; next Medium R29-05-A local rollout evidence preparation.

R29-04-D review — 2026-09-14: [bounded security/behavior decision](architecture/HISTORY_SCOPE_LOOKUP_R29_04_D.md) separates history existence checking from unused summary dependencies. A new independent OFF-by-default opt-in may save three companion queries and optional demographics decryption; this is not measured Worker CPU. Error semantics and the required regression matrix are explicit. Current baseline 2 files/30 tests passed; implementation is next Medium E, not completed in D.

R29-04-C progress — 2026-09-14: [local index tradeoffs](R29_04_C_INDEX_TRADEOFFS_2026-09-14.md) records 36 timeline plus eight observation comparisons, per-index B-tree bytes and compiled insert overhead. Encounter/fulfillment sorts improve separately; outer order sort remains. No migration selected/applied and no real D1 cost claim. Next bounded High R29-04-D reviews the unused-summary existence gate before code changes.

R29-04 A/B progress — 2026-09-14: [request-owned keys](R29_04_A_REQUEST_KEYS_2026-09-14.md) remain default OFF. [B local query assessment](R29_04_B_QUERY_PLANS_2026-09-14.md) identifies a measured observation sort/index candidate, not a selected migration; eight synthetic SQL comparisons pass. Full rows/CPU, write/storage tradeoffs and timeline assessment remain. Next Medium R29-04-C; do not repeat A or assume R29-04 complete.

R29-03-B review — 2026-09-14: [conditional transport contract](architecture/D1_BOOKMARK_TRANSPORT_R29_03_B.md) resolves verified sessionId/expiry/epoch binding, encrypted purpose separation and client retry/write lifecycle ownership. Defer wire implementation until a named consumer passes the usefulness/freshness gate: a header that is ignored in favor of first-primary adds no demonstrated benefit to current history reads. A and read replication remain scheduled for independent RC measurement; B is not implemented and R29-03 is not fully complete. Proceed next to approved R29-04-A, with Medium model checkpoint.

R29-03 progress — 2026-09-13: [bounded High review](architecture/D1_READ_CONSISTENCY_R29_03.md) followed by [A local implementation](R29_03_A_READ_SESSIONS_2026-09-13.md). Exact history GET has an OFF-by-default fresh-primary read session, serialized execution, primary auth/write isolation and routing metadata coverage. Worker 50 files/310 tests, typecheck and lint passed. Current clinical routes may not start solely from an older browser bookmark. B propagation, workerd/real RC consistency and benefit/cost evidence, and provider activation remain pending. Official documentation/latest types superseded the skill's outdated replica/session examples. No remote setting/deployment changed.

Status: approved implementation backlog; not deployed or measured. Reuse R28-05 evidence and existing readers instead of duplicating instrumentation. No required paid cache service is accepted. Verify current provider availability, quotas and cost before selecting or activating provider features; free software does not imply unlimited free hosting.

R29-01 progress — 2026-09-11: [local resource baseline packet](R29_01_RESOURCE_BASELINE_2026-09-11.md) implements metric-v2 returned/scanned-row coverage and failure accounting, plus a reproducible 63-sample synthetic/real-crypto benchmark. Local tests/typecheck/lint passed. Actual RC Worker CPU, authenticated latency, complete D1 scanned rows and cold-start evidence remain pending; R29-01 is not fully complete. R29-02/03/04/05 remain approved backlog.

R29-02 / R30-02 progress — 2026-09-11: [public offline cache packet](R29_02_R30_02_PUBLIC_OFFLINE_CACHE_2026-09-11.md) implements an opt-in verified public bundle, bounded browser Service Worker memory and immutable Pages snapshot headers. Synthetic real-browser offline/restart evidence passed. No Cloudflare-side PHI/auth cache or Redis was introduced. The full application static export fails on the existing dynamic patient route; public RSC navigation and split-market adapter acceptance are still required. Bundle activation stays default-off; neither roadmap item is fully complete.

| ID | Scope and acceptance gate | Dependencies | Recommended model |
| --- | --- | --- | --- |
| R29-01 | Capture reproducible synthetic small/medium/large cohorts, source SHA, environment, warm/cold runs and numerical CPU, latency p50/p95, query count, rows read/returned, decryption count/time and response-byte budgets. Separate local timing from real Worker CPU; missing RC measurements remain pending, never fabricated. Include repeat-read/cloud-request baseline. | R28-05 reconciliation; R30-01 boundary | Sol High |
| R29-02 | Three layers: versioned client non-sensitive assets/computation; bounded isolate memory for eligible reusable objects; edge cache for explicitly public immutable responses. Record data class, key, size/TTL, invalidation, version and owner. Default exclude PHI, auth decisions, tokens and personalized responses from shared caching. Request-scoped memoization must preserve isolation. Test hit/miss, invalidation, expiry, logout and cross-practice isolation. | R29-01; R30-01 | Sol High |
| R29-03 | Introduce D1 read replication through supported sessions/bookmarks. Specify per-flow read-after-write and cross-request bookmark propagation; keep authorization/revocation and write invariants on an authoritative path. Test stale/missing bookmarks, concurrent writes, scope changes and rollback. Measure benefit before activation. | R29-01; authorization/read inventory | Astra High design, Sol High implementation |
| R29-04 | Measure CryptoKey reuse, bounded decryption concurrency and query/index improvements. Preserve AAD, key rotation, tenant isolation and completeness; use new numbered migrations only. Compare plans/rows and before/after budgets with behavioral regression evidence. | R29-01/02; R30-01 | Sol High; short Astra High security review if needed |
| R29-05 | RC candidate evidence for applicable Turnstile endpoints, Smart Placement experiments and feature-flag rollout/rollback. Server verification remains mandatory for protected online actions. Offline local workflows cannot require an online challenge. Record actual cost/latency impact; retain disabled settings when no demonstrated benefit. | R29-02/03/04; R30-09 for installed-product release | Sol High; short Astra High final audit |

R29-05-A progress — 2026-09-15: [local matrix and pending remote gates](R29_05_A_LOCAL_ROLLOUT_2026-09-15.md) covers independent flags and full rollback with scoped source fingerprints. Local checks pass, provider CPU/rows/replication and individual/in-flight/version rollback remain unmeasured. Turnstile, Smart Placement and final installed-product RC acceptance remain separate. GitHub publication is blocked by confirmed Pages all-branch Preview deployment under the owner's no-Deploy constraint; no cloud setting was changed.

## 30. Local-First & Network Resilience — owner approved 2026-09-11

Status: accepted target architecture; R30-01 design and R30-03 reference-shell clean-VM acceptance are complete, while protected local storage/auth/sync runtime implementation remains pending. [R30-01 capability/authority matrix and threat model](architecture/LOCAL_FIRST_R30_01.md) defines supported workflows, data classes, R29 constraints and unresolved activation policies. Installed, enrolled users must retain explicitly supported workflows when Internet, GitHub and Cloudflare are unreachable. Cloud services become synchronization/remote collaboration dependencies for supported local workflows. Existing Worker/D1 authority stays in force until each local adapter and sync boundary passes its gates. Do not describe current PWA as full offline.

Two delivery levels: PWA Offline-Lite for bundled reference content and deterministic clinical computation, without persistent PHI by default; Windows Tauri 2 Offline-Full for enrolled devices with encrypted local SQLite and scoped sync. Reuse existing frontend, contracts and clinical engine. GitHub is a development/distribution source, never an installed-app startup dependency.

R30-02 design progress — 2026-09-12: [bounded High compatibility design](architecture/STATIC_OFFLINE_COMPATIBILITY_R30_02.md) is complete locally. Medium packets A–C cover the static patient entry/legacy links, explicit document navigation and shared validated market loader with retry. Packet D retains real installed-access/freshness gates: existing clinical session restoration and local catalog drafts prevent treating cached files as accepted offline clinical operation. No runtime change in this design packet; R29-01 through R29-05 remain approved and incomplete where evidence is still pending.

R30-02 implementation progress — 2026-09-13: [A–C infrastructure](R30_02_STATIC_COMPATIBILITY_2026-09-12.md) and subsequent [D1/D2 reference-lite implementation](R30_02_REFERENCE_LITE_2026-09-12.md) have local evidence. The source `nfi_verified` mismatch is corrected under the reviewed D design with nonempty/exact-ID tests and unchanged downstream clinical gates. Standalone public references work offline after complete installation, independently of auth/admin drafts; this is not offline treatment calculation or protected record access. The new opt-in reference-lite profile excludes raw admin/market payloads and replaces the experimental four-clinical-shell cache. Bundle activation stays OFF, and neither R29-02 nor R30-02 is fully complete. All five R29 tasks remain in scope.

R30-03 progress — 2026-09-21: [A design](architecture/WINDOWS_SHELL_R30_03_A.md), [B deterministic reference implementation](R30_03_B_DESKTOP_REFERENCE_2026-09-20.md), [C1 native evidence](R30_03_C_NATIVE_ACCEPTANCE_2026-09-20.md) and [C2 clean-VM evidence](R30_03_C2_ACCEPTANCE_KIT_2026-09-21.md) are complete for the reference-only shell. The externally pinned candidate passed clean non-admin Windows 11 Preflight, offline install, recorded preinstalled WebView2, real reboot, full network blackout, runtime policy and silent uninstall/reinstall; Finalize returned `accepted=true`. A naturally WebView2-absent supported target remains separate compatibility coverage. No PHI capability, protected local workspace, signing, deployment or R29 completion follows from C2.

| ID | Scope and acceptance gate | Dependencies | Recommended model |
| --- | --- | --- | --- |
| R30-01 | Inventory supported workflows as local-full, local-read-only, queued or online-only; record authority/write owner, PHI class, device/practice scope, freshness and degraded behavior. Threat model covers device theft, revoked users, clock rollback, stale rules and conflicting writes. Define unresolved policy choices explicitly. | Existing patient/auth/clinical contracts | Astra High, bounded design packet |
| R30-02 | Versioned complete app-shell/chunk/catalog/rule/font precache, no mandatory runtime CDN. Test offline cold restart after completed install, failed/partial updates and rollback. UI states offline/freshness clearly; sensitive API responses never enter public caches. | R30-01; coordinate R29-02 | Sol High |
| R30-03 | **Reference-only shell complete through C2.** Tauri 2 reuses the deterministic static reference UI with least-privilege capabilities and an offline current-user installer. [A design](architecture/WINDOWS_SHELL_R30_03_A.md), [B implementation](R30_03_B_DESKTOP_REFERENCE_2026-09-20.md), [C1 native evidence](R30_03_C_NATIVE_ACCEPTANCE_2026-09-20.md) and [C2 clean-Windows/full-blackout evidence](R30_03_C2_ACCEPTANCE_KIT_2026-09-21.md) pass. A naturally WebView2-absent supported target and signed distribution remain independent compatibility/release gates. Protected PHI/auth/local workspace capability belongs to R30-04/05/07 and R31. | R30-01/02 | Astra High design, Sol High implementation |
| R30-04 | Encrypted local SQLite, migrations, practice/device-scoped data subset, native key custody and encrypted backup/restore. [R30-04-A](architecture/ENCRYPTED_LOCAL_STORAGE_R30_04_A.md) retains SQLCipher Community; B1/B2 prerequisite evidence remains intact. [KC1/native selection](architecture/KEY_CUSTODY_R30_04_B2_PROTOCOL_V1.md) and the [partial isolated harness](R30_04_B2_KC1_PARTIAL_HARNESS_2026-09-30.md) do not accept product custody or persistent recovery. Next Sol High immutable/native generation and recovery proof; SQLCipher memory remains a blocker requiring evidence and Astra review. C follows B2 and R30-05/07. All lost-key/corruption/migration/isolation and replacement-device gates remain. | R30-01/03; before R31-01/03/09 | **Astra High design/security checkpoints**, Sol High implementation |
| R30-05 | Shared repository/storage ports and local/remote adapters with existing validation and authorization boundaries. Local execution must not create parallel clinical authority or bypass patient binding/confirmation. Contract parity tests for supported local operations. | R30-01/04 | Astra High design, Sol High implementation |
| R30-06 | Durable transactional outbox/inbox, delta sync, idempotency, revisions, acknowledgements and conflict UI. Test offline edits, retry/crash, duplicate delivery, delete/tombstone, reconnect and concurrent devices. No automatic last-write-wins for clinical facts/orders; no duplicate patient/encounter or file-number allocation. Cloud-linked UI shows last sync/backlog/conflicts and warns weekly when eligible unsent work is older than seven days; intentional Local Only mode has no sync nag. | R30-04/05/07 contract; R31-08 | Astra High design, Sol High implementation |
| R30-07 | Define two authority profiles. Cloud-linked devices use enrollment, local lock and signed time-bounded offline grants with practice/role scope, expiry/clock rollback and revocation catch-up; offline revocation cannot be instantaneous and an expired/invalid grant fails closed for protected actions. Local Only clinics instead use a locally established owner and local RBAC protected by the selected key/recovery design; those accounts are never represented as centrally verified and later enrollment is an explicit audited transition. | R30-01/04; R31-01 | Astra High design, Sol High implementation |
| R30-08 | Bundled versioned data, signed installers/updates, independent update origins and offline-file update path with verification/rollback. Startup continues with the last accepted bundle when hosts are blocked. No cloud signing secrets in clients. | R30-03/04 | Sol High |
| R30-09 | Blackout/recovery evidence for blocked GitHub, Cloudflare, DNS and all Internet; cold launch, scoped local reads/writes, reboot, backup, reconnect/conflicts and update rollback. Measure cloud-request reduction plus local CPU/memory/disk and battery tradeoffs. Online AI/SMS/email/payer actions display unavailable/queued, never false success. | R30-02 through R30-08 | Sol High; short Astra High final audit |
| R30-10 | Required target Clinic Host for multiple trusted LAN devices without Internet, implemented only after the single-device desktop slice. One host owns the operational database, narrow local API, auth/RBAC, PWA assets, Clinical Engine/local-AI adapters and sync queue. HTTPS host identity/certificate trust, discovery, separate QR bootstrap/pairing, physician approval and independent Android/iOS PWA acceptance are mandatory; scanning alone grants no access. | R30-03/04/05/07; R31-01/03/04 | Astra High design, Sol High implementation |

Developer prerequisites: Tauri/Rust/Cargo and Windows MSVC build tools, the R30-04-A native SQLCipher candidate and B2 single-purpose native custody adapter, and existing test tools. Stronghold remains historical spike evidence, not the selected product dependency. Do not expose generic Tauri SQL/secret-store operations to the renderer; exact dependencies and notices are pinned/tested in B1/B2. End users install the Windows package and bundled offline WebView2 prerequisite if absent; they need no Git, Node or Rust. Record installer signing/toolchain distribution costs explicitly; do not claim a zero-cost trusted-signing service. Redis is not required for local storage. An independent mirror/VPS remains separately scoped; the required target Clinic Host uses local hardware and offline operation itself requires no new hosted service.

Execution order: retained R30-01/A/C2 and B1/B2 prerequisite evidence (R30-02 still partial) → completed reopening/remediation/KDF packets → **KC1/native selection and public primitive vectors** → Sol High persistent/native B2 harness and SQLCipher remediation evidence → bounded Astra memory/acceptance review before B2 closure → R30-04-C after B2 and R30-05/07 contracts, coordinated with R31-01/02 → single-device R31-03 then R30-10/R31-04 Clinic Host → R31-06 then R31-07 → R31-05/R31-08 → R31-09 → R30-08/09 and R31-10 exact-candidate acceptance → R29-05 final installed-product RC gate. Collect independent R29 RC evidence earlier where possible without closing missing gates. Preserve clinical review, migration and production activation gates.
