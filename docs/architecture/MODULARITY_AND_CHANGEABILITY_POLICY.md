# GLYMIZE Modularity & Changeability Policy

**Status:** Normative architecture policy for the canonical GLYMIZE roadmap  
**Effective date:** 2026-09-09  
**Applies to:** all new and materially changed application, clinical, runtime, UI, AI, data, and workflow code

> This policy is a mandatory implementation guardrail for `docs/ROADMAP.md`. A roadmap task is not complete if it violates these rules, even when its tests pass.

---

## 1. Goal

GLYMIZE is expected to grow from a mature Diabetes reference domain into a broad Adult Medicine Clinical Workspace. Future maintainability, safe diagnosis of defects, clinical review, and incremental specialty expansion therefore depend on strict modular architecture.

The codebase must remain easy to:

- understand;
- test;
- diagnose;
- replace;
- extend;
- review clinically;
- migrate safely;
- roll back selectively.

Large files, God modules, and sprawling `if / else if / else` decision trees are explicitly contrary to this goal.

---

## 2. Non-negotiable rules

### M1 — One clear responsibility per module

Each module should own one cohesive responsibility. Separate, for example:

- data acquisition;
- normalization;
- clinical facts;
- eligibility/safety;
- decision rules;
- evidence/provenance;
- presentation/view models;
- UI rendering;
- persistence;
- external provider adapters;
- orchestration.

Do not combine unrelated responsibilities merely because they participate in the same screen or workflow.

### M2 — No God files or God components

A single file must not become the authoritative home for an entire specialty, patient workspace, Worker runtime, medication platform, or clinical engine.

When a file begins accumulating multiple independent concepts, split it along stable domain boundaries before adding more features.

File size alone is not the only criterion, but sustained growth is a design signal that requires review.

### M3 — Large `if/else` clinical decision trees are prohibited

Do not implement expanding clinical knowledge as a long sequence of conditionals such as:

```text
if disease A ...
else if disease B ...
else if drug C ...
else if renal condition D ...
else if pregnancy ...
...
```

Likewise, do not hide the same anti-pattern inside large `switch` statements, nested ternaries, or giant functions.

Clinical knowledge should preferentially be represented through reviewed, versioned structures such as:

- rule objects;
- registries;
- declarative constraints;
- decision-graph nodes/edges;
- strategy/policy modules;
- capability declarations;
- evidence-bound protocol objects;
- module-specific handlers.

Imperative branching remains acceptable for small local control flow where it is clearer and safer than abstraction. The prohibition is against **growing knowledge bases encoded as monolithic branching logic**.

### M4 — Data/rule-driven before branch-driven

Adding or updating a medication, contraindication, evidence source, specialty module, or reviewed protocol should normally require changing the relevant data/rule/module package—not editing an unrelated central branching function.

If a routine knowledge update requires touching many unrelated files, the architecture should be reviewed for missing abstraction.

### M5 — Clinical modules are independently replaceable

Diabetes, Kidney, Cardiovascular, Pulmonary, GI/Hepatology, Infectious Disease, Neurology, Rheumatology, Hematology, and future modules must implement shared contracts but keep domain-specific logic in their own bounded modules.

A module should be independently testable and, where possible, independently enableable/disableable without rewriting Patient Core or unrelated specialties.

### M6 — Shared core does not mean shared dumping ground

Patient Clinical Core, Medication Intelligence, Evidence Platform, and shared contracts may contain genuinely cross-domain concepts only.

Do not move domain-specific logic into a shared package merely to avoid creating another module.

### M7 — Orchestrators coordinate; they do not contain domain knowledge

Route handlers, page components, Worker entry points, controllers, and workflow orchestrators should compose services/modules and handle boundaries. They should not accumulate detailed clinical rules, medication logic, persistence internals, and UI mapping in one place.

### M8 — UI is componentized by clinical responsibility

Large patient screens should be composed from independent clinical components/view models such as:

- Patient Strip;
- Clinical Brief;
- What Changed;
- Problem card/graph;
- Medication panel;
- Trend card;
- Action card;
- Evidence drawer;
- Clinical Module launcher;
- contextual Copilot.

Avoid page components containing networking, domain calculations, mutation state, layout, rule interpretation, and rendering in one file.

### M9 — Provider integrations use adapters

AI providers, terminology services, medication sources, insurer sources, importers, and future external integrations must sit behind stable interfaces/adapters so a provider can be replaced without rewriting clinical workflows.

### M10 — Persistence is separated from clinical reasoning

D1/PostgreSQL/file/browser persistence concerns must not define clinical decisions. Domain services consume typed repositories/read models rather than embedding SQL/storage-specific branching into clinical logic.

### M11 — Every module has local tests

A reusable or clinical module should have focused tests near its responsibility in addition to whole-system tests.

Tests should make it possible to identify which module failed rather than reporting only that an end-to-end workflow failed.

### M12 — Public boundaries are versioned

Modules communicate through explicit, typed and versioned contracts where the boundary is persisted, externally exposed, or independently deployable.

Avoid implicit coupling through undocumented object shapes or shared mutable state.

### M13 — Dependency direction must remain visible

Preferred conceptual dependency direction:

```text
UI / Routes
  ↓
Application orchestration
  ↓
Domain modules / services
  ↓
Shared clinical contracts and core policies
  ↓
Repository / provider interfaces
  ↓
Infrastructure adapters
```

Clinical-engine authority must not depend on UI presentation code.

### M14 — Circular dependencies are defects

New circular package/module dependencies are not acceptable. When two modules appear to require each other, extract the actual shared contract or reconsider ownership.

### M15 — Change blast radius is an architecture metric

During review ask:

> How many independent modules must change to add one new clinical capability?

For ordinary domain expansion the answer should be small and predictable. A large blast radius is evidence of coupling and should be corrected before scaling the pattern.

---

## 3. Code-size guardrails

There is no single clinically safe universal line-count limit, so line count is a **review trigger**, not a mechanical acceptance rule.

Nevertheless GLYMIZE should use the following working thresholds for new or materially changed code:

### Review trigger

A source file approaching roughly **400 lines of executable/application code** should trigger an explicit cohesion review before further growth.

### Strong refactor trigger

A source file approaching roughly **700 lines of executable/application code** normally requires decomposition unless there is a documented, reviewed reason the file is an inherently atomic generated/static artifact.

### Function/component trigger

Functions or React components that become difficult to understand without scrolling through multiple unrelated phases should be decomposed before new behavior is added. Prefer named operations/policies over deeply nested blocks.

### Exemptions

Generated code, static verified datasets, migrations, fixtures, and evidence artefacts may legitimately exceed these thresholds. Their generation/ownership should still be clear, and they must not be used to hide executable branching logic.

The objective is maintainability and diagnostic isolation, not chasing arbitrary line counts.

---

## 4. Clinical rule architecture

For expanding Adult Medicine support, prefer this shape:

```text
Clinical Module
  ├─ capability manifest
  ├─ input requirements
  ├─ evidence registry bindings
  ├─ objectives
  ├─ eligibility / exclusions
  ├─ protocols / rule objects
  ├─ recommendation graph / composition
  ├─ monitoring / investigation policies
  ├─ escalation policies
  └─ tests / clinician golden cases
```

Shared layers remain separate:

```text
Patient Clinical Core
Medication Intelligence
Cross-Domain Safety / Conflict Resolver
Evidence Platform
AI Copilot
Presentation
```

A future Kidney rule should therefore not require adding another branch to a Diabetes function. It should live in the Kidney module and interact through shared patient/medication/evidence contracts.

---

## 5. Preferred extensibility patterns

Use the simplest suitable pattern; do not over-engineer. Preferred patterns include:

### Registry

For discoverable modules/rules/adapters keyed by stable identity.

### Strategy / Policy

For replaceable behavior that varies by clinical domain, provider, or workflow.

### Pipeline

For ordered independent stages such as normalize → validate → safety screen → resolve objectives → compose → present.

### Rule object / declarative table

For reviewed clinical conditions and actions with provenance/version metadata.

### Adapter

For external AI/data/infrastructure providers.

### Facade

For preserving compatibility while internals are decomposed.

### Read model / projection

For patient workspace presentation without coupling UI to storage schemas.

Patterns are tools, not goals. Avoid abstractions that add indirection without improving ownership, testing, or changeability.

---

## 6. Pull-request architecture gate

Every significant PR must answer, explicitly or through review evidence:

- What module owns this behavior?
- Did the change create or enlarge a God file?
- Did it add a growing `if/else` or `switch` knowledge tree?
- Could the behavior be a rule/registry/strategy instead?
- Is domain-specific behavior leaking into shared core?
- Are persistence/provider details leaking into clinical logic?
- Are public/persisted boundaries typed/versioned?
- Can the changed module be tested independently?
- Did dependencies remain one-directional and cycle-free?
- Is the expected future change blast radius acceptable?

A PR that materially worsens these properties should not merge merely because automated tests pass.

---

## 7. Refactoring policy for existing large modules

Existing large files are not automatically rewritten all at once.

Use behavior-preserving incremental decomposition:

1. characterize current behavior with focused tests;
2. identify cohesive responsibility boundaries;
3. extract one responsibility at a time;
4. preserve a compatibility facade where callers require it;
5. run equivalence/regression tests;
6. move callers gradually;
7. retire the facade only when no required consumer remains.

Do not mix a large structural decomposition with new clinical thresholds/rules unless the clinical change is separately reviewed and clearly isolated.

---

## 8. Diagnostics requirement

Modularity should improve real-world diagnosis.

Each important module should expose enough structured identity/context that logs, audit records, errors, and tests can identify the failing layer, for example:

```text
patient-core
medication-eligibility
clinical-module:diabetes
clinical-module:kidney
evidence
ai-provider
patient-workspace
runtime-auth
persistence-adapter
```

Avoid generic failures produced by a single massive orchestration file.

---

## 9. Definition of done for future architecture work

A feature is not architecturally complete when it merely works.

It should also be:

- owned by a clear module;
- reasonably small/cohesive;
- independently testable;
- connected through explicit contracts;
- free from unnecessary circular dependency;
- free from monolithic clinical branching;
- explainable in dependency direction;
- replaceable without broad unrelated rewrites;
- diagnosable at module level.

---

## 10. Roadmap integration

This policy applies across all canonical roadmap phases, particularly:

- **Phase B — Longitudinal Patient Core v3:** separate facts, contexts, read models, repositories, change detection, and persistence adapters.
- **Phase C — Physician Workspace vNext:** split clinical cards/view models/interactions instead of creating a monolithic Patient page.
- **Phase D — Medication Intelligence:** registries/policies/rules rather than drug-specific branching trees.
- **Phase E — Evidence + AI:** provider adapters and independent retrieval/synthesis/action layers.
- **Phase F — Clinical Module Framework:** enforce the module contract and dependency direction before specialty expansion.
- **Phase G onward:** every new specialty is an independent domain module using shared core contracts.

The architecture checkpoint must occur **before** broad specialty expansion so the same scalable pattern is used for Kidney, Cardiovascular, Pulmonary, GI/Hepatology, Infectious Disease, Neurology, Rheumatology, Hematology, and later modules.

---

## 11. Canonical architectural rule

> **GLYMIZE must grow by adding or replacing bounded modules and reviewed rule/data objects—not by growing central files or central `if/else` trees.**
