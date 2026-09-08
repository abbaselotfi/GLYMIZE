# ADR — Patient Clinical Core Migration Strategy

**Status:** Accepted for B-series implementation planning  
**Date:** 2026-09-09  
**Roadmap task:** B1 — Patient Clinical Core architecture inventory  
**Related inventory:** `PATIENT_CLINICAL_CORE_INVENTORY.md`  
**Related policy:** `MODULARITY_AND_CHANGEABILITY_POLICY.md`

---

## Context

GLYMIZE already has a meaningful longitudinal patient/runtime foundation:

- Cloudflare Worker/D1 Patient Record v2 authority;
- practice-scoped patient records and additive global identity;
- encounters and immutable/revision-aware snapshots;
- observations, archive/workspace reads, trends, orders, referrals, care relationships, and scheduling foundations;
- physician Patient Workspace capabilities;
- shared contracts;
- clinical-engine, medication, evidence, and AI foundations.

The approved product direction now requires a general Adult Medicine Patient Clinical Core that can serve multiple clinical specialties, a visual/touch-first physician workspace, Medication Intelligence, Smart Routing, and an AI Copilot.

There are two broad ways to reach that state:

1. replace the current patient runtime with a new generalized clinical data store/model; or
2. converge existing capabilities behind a new canonical read/context contract while preserving the current write authority and migrating incrementally.

A replacement would create unnecessary data-migration risk, duplicate authority during transition, and a large regression surface. It would also conflict with the project's new modularity/changeability policy.

---

## Decision

GLYMIZE will use **incremental convergence over replacement**.

The existing Cloudflare Worker/D1 Patient Record v2 remains the authoritative patient/encounter persistence and write boundary.

The Patient Clinical Core will initially be introduced as:

1. small shared contracts for canonical patient clinical facts and views;
2. normalization/projection services over existing Patient Record v2 data;
3. a versioned `PatientContextView` for approved clinical/AI consumers;
4. a deterministic `PatientChangeSet` projection for longitudinal change detection;
5. visual physician-facing read components consuming those projections;
6. adapters that allow existing Diabetes/clinical-engine behavior to consume the shared context without changing its clinical authority;
7. compatibility re-exports/routes during migration.

No second patient store will be introduced merely to implement the Patient Clinical Core.

---

## Authority model

```text
              WRITE AUTHORITY
                    │
                    ▼
        Worker / D1 Patient Record v2
                    │
                    ▼
         normalization / projections
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
 PatientContext  ChangeSet  Trend/Brief views
          │         │         │
          ├─────────┼─────────┤
          ▼         ▼         ▼
    Physician UI  Clinical Modules  AI Copilot
```

Consumers may request a physician-confirmed action through the appropriate runtime action endpoint, but they do not become alternative write authorities.

---

## Dependency rules

The migration must preserve one-way dependency direction:

```text
UI / AI / Clinical Module
          ↓
versioned patient-core contracts
          ↓
projection / application services
          ↓
existing Patient Record runtime
          ↓
D1
```

Forbidden dependency patterns include:

- Patient Record persistence importing specialty UI logic;
- Patient Core importing a Diabetes-specific treatment engine;
- AI provider code becoming required by core persistence;
- individual specialty modules writing shadow patient tables;
- a central switch/if tree dispatching all future specialties.

---

## Contract migration strategy

### Step 1 — Add cohesive Patient Core contracts

Introduce small contract families rather than extending `patient-record-v2.ts` indefinitely.

Compatibility exports may remain in `packages/contracts/src/index.ts`, but implementation ownership should live in cohesive modules.

### Step 2 — Build projections from current authority

Create pure or narrowly bounded projection/normalization functions that map existing runtime records into canonical views.

Where a required fact is not present, represent it as missing/unknown rather than inventing a value.

### Step 3 — Establish provenance and freshness semantics

Every clinically reusable view must retain enough metadata to distinguish:

- source;
- effective time;
- recorded time;
- verified/unverified state where supported;
- stale/current/unknown state;
- revision/version.

### Step 4 — Build visual read experience

The new Patient Overview consumes projections, not raw database rows.

It presents clinical awareness first and source/raw detail through progressive disclosure.

### Step 5 — Add AI context adapter

AI receives only a curated/versioned PatientContextView with appropriate provenance and permitted context.

AI does not query arbitrary persistence tables as its core product contract.

### Step 6 — Introduce Clinical Module registry

Modules declare required/optional facts and outputs through a typed registry/contract.

A new specialty is added primarily by registering a module/rule pack, not by growing a central branch tree.

### Step 7 — Migrate Diabetes under regression protection

Existing Decision Graph v2, insulin conversion, medication safety, evidence, and clinical behavior remain protected by the established regression/safety suite.

Migration changes how the module receives patient context and how it is presented; it must not silently change the clinical authority.

### Step 8 — Prove extensibility with a second domain

A Kidney/Cardiovascular-adjacent domain is a strong candidate because existing cardiometabolic facts and reviewed rules provide reuse, subject to clinical/roadmap review.

The architectural acceptance test is that this second domain can be added without rewriting Patient Core or Diabetes.

---

## Schema policy

This ADR does **not** authorize a new D1 migration.

A future B-series task may propose a schema change only when all of the following are true:

1. the required semantic cannot safely be represented by existing authoritative structures/projections;
2. the new persistence responsibility has a single clear owner;
3. backward compatibility/migration behavior is explicit;
4. no second source of truth is created;
5. contracts and tests are defined first;
6. the change is reviewed independently from UI refactoring.

PostgreSQL remains a foundation/deferred architecture and is not selected by this ADR as the Patient Clinical Core runtime.

---

## UI migration policy

The physician UI migration is progressive rather than a one-shot replacement.

Existing patient workspace features are treated as reusable capabilities. They may be recomposed into the new visual Patient Overview behind stable read contracts.

The target interaction sequence is:

```text
Awareness
  → focused visual detail
    → raw/source/audit detail when requested
```

The migration must preserve:

- critical safety visibility;
- touch/stylus target usability;
- RTL/LTR behavior;
- keyboard/mouse accessibility;
- source traceability;
- existing critical-flow behavior until intentionally replaced.

---

## AI migration policy

The existing Evidence Assistant and AI provider configuration are preserved.

The new AI Patient Context integration is additive and adapter-based.

Clinical safety invariants:

- deterministic hard exclusions remain authoritative;
- AI cannot clear a deterministic safety block;
- AI-generated findings do not become patient facts without an explicit reviewed/confirmed path;
- AI-generated actions remain drafts until physician confirmation;
- model/provider replacement must not require rewriting Patient Core.

---

## Rollout and rollback

Each migration slice should be independently reviewable and reversible.

Preferred rollout pattern:

1. add contract;
2. add projection and equivalence tests;
3. consume it in one bounded read surface;
4. verify regression/Playwright behavior;
5. expand consumers;
6. remove old compatibility path only after proven parity and explicit cleanup task.

A rollback should be able to restore the previous consumer/read path without reverting unrelated clinical modules or data migrations.

Avoid big-bang patient-record rewrites.

---

## Consequences

### Positive

- preserves proven Patient Record v2/D1 authority;
- avoids a second patient store;
- lowers clinical/regression risk;
- allows UI, AI, and specialty modules to evolve independently;
- supports touch/visual redesign without coupling it to persistence rewrite;
- makes future specialty expansion additive;
- allows existing Diabetes work to remain the safety reference implementation;
- makes source/provenance/freshness a shared platform concern.

### Costs

- temporary compatibility adapters/re-exports will exist;
- some large existing façades will remain until touched by bounded migration tasks;
- Patient Core contracts must be carefully versioned to avoid another central monolith;
- equivalence tests are required during transition;
- duplicate *representations* may temporarily exist at API/view level, but duplicate persistence authority is prohibited.

---

## Alternatives rejected

### A. Replace Patient Record v2 with a new generic EHR database now

Rejected because it creates migration risk and duplicate authority before a demonstrated persistence requirement exists.

### B. Let each specialty own its own patient schema

Rejected because it duplicates facts, creates conflicting patient states, and makes cross-domain safety unreliable.

### C. Put all future Adult Medicine fields into one Patient Record contract/file

Rejected because it creates a God contract, high blast radius, and violates the modularity policy.

### D. Make the AI model the canonical patient-context layer

Rejected because model behavior is replaceable/non-deterministic and cannot serve as the authoritative representation of patient facts or safety rules.

---

## B1 gap matrix

| Capability | Current state | Gap | Planned closure |
| --- | --- | --- | --- |
| Longitudinal patient persistence | Strong Worker/D1 foundation | no general Adult Medicine read contract | B2 projection/contracts |
| Identity + practice scope | Implemented foundations | must be explicit in every core view | B2 |
| Patient facts/provenance | distributed across existing contracts/runtime | no universal fact/freshness semantics | B2 |
| Problem representation | partial/route-specific | no canonical Problem Graph contract | B2 then incremental graph expansion |
| Medication reconciliation | implemented physician capability | needs canonical shared patient medication state + Medication Intelligence link | B2/B4 |
| Labs/observations/trends | implemented foundations | need general observation/freshness view | B2/B3 |
| What Changed | current workspace capability exists | no universal versioned PatientChangeSet | B2/B3 |
| 10-Second Clinical Brief | target product behavior | no canonical compact projection | B3 |
| Visual/touch physician UI | responsive foundations exist | not yet platform-level clinical awareness experience | B3 |
| AI patient context | AI/Evidence foundation exists | no canonical permitted PatientContextView | B5 |
| Clinical module extension | mature Type 2 authority exists | no universal module registry/maturity contract | B6 |
| Diabetes integration | mature existing assets | still route/domain-specific | B7 |
| Second specialty | cardiometabolic primitives exist | platform extensibility not yet proven by independent module | B8 |
| DecisionRecord | planned | no production persistence authority | later dedicated architecture task |
| Large compatibility façades | partially decomposed | remaining high-cohesion/blast-radius debt | incremental decomposition when touched |
| Codebase graph provenance | snapshot exists | architecture/Roadmap changes were not guaranteed triggers | B1 workflow fix + post-merge verification |

---

## Acceptance

This ADR satisfies the migration-decision portion of Roadmap B1 when paired with `PATIENT_CLINICAL_CORE_INVENTORY.md` and successful repository validation.

The immediate next implementation decision after B1 is B2: **small versioned Patient Clinical Core contracts plus a read projection over the existing Worker/D1 authority**.
