# GLYMIZE — Project Overview and Improvement Roadmap

> **Purpose of this document**  
> This file is the shared reference for understanding the current state of GLYMIZE, its architecture, implemented capabilities, known limitations, and the step-by-step improvement plan. It should be updated whenever a major architectural, clinical, product, branding, or deployment decision changes.

**Repository:** `abbaselotfi/GLYMIZE`  
**Document status:** Living document  
**Initial review date:** 2026-07-31  
**Current product maturity:** Advanced prototype / pre-clinical decision-support platform

---

## 0. Suggestion → roadmap traceability matrix

This matrix records the project-owner directives accepted on 2026-09-03 and makes their execution order auditable. The task identifiers below are canonical for new work. Each numbered task must be delivered in its own independently reviewable PR.

| Row | Accepted suggestion | Roadmap location | Delivery task |
| --- | --- | --- | --- |
| 1 | Establish one repository-wide lint and formatting baseline | §8.19 | Phase 0 / Task 1 |
| 2 | Run install, typecheck, lint, and tests on every pull request to `main` | §8.20 | Phase 0 / Task 2 |
| 3 | Add unit and browser coverage for `apps/web`, including the Care Team handoff regression | §8.21 | Phase 0 / Task 3 |
| 4 | State the authoritative runtime for catalogue, clinical, and patient data | §8.22 | Phase 0 / Task 4 |
| 5 | Separate factual current state from the aspirational roadmap | §8.22 | Phase 0 / Task 5 |
| 6 | Enforce server-side roles on patient-adjacent Worker routes | §8.23 | Phase 0 / Task 6 |
| 7 | Decompose the five named oversized modules without behavior changes | §8.24 | Phase 0 / Task 7 |
| 8 | Consolidate versioned and hotfix CSS into maintained sources of truth | §8.25 | Phase 0 / Task 8 |
| 9 | Decide the production catalogue persistence model before implementing it | §8.26 | Phase 0 / Task 9 |
| 10 | Trace and document the Type 2 engine actually serving the live route | §8.27 | Phase 3 / Task 1 |
| 11 | Converge the live Type 2 path on `decision-graph-v2` | §8.27 | Phase 3 / Task 2 |
| 12 | Eliminate independently duplicated clinical thresholds | §8.28 | Phase 3 / Task 3 |
| 13 | Make hard contraindications structural exclusions | §8.29 | Phase 3 / Task 4 |
| 14 | Index product- and dose-specific evidence in Evidence Assistant | §8.30 | Phase 3 / Task 5 |
| 15 | Add verified cardiac, renal, hypertension, and lipid products before related logic | §8.31 | Phase 4 / Task 6 |
| 16 | Add guideline-sourced BP/lipid objectives and product-dose rules | §8.32 | Phase 4 / Tasks 7–8 |
| 17 | Prove scenario diversity and extend stress validation to the new domains | §8.33 | Phase 4 / Tasks 9–10 |

### Execution and safety rules for rows 1–17

- Execute Phase 0 Tasks 1–9 in order, then Phase 3 Tasks 1–5, then Phase 4 Tasks 6–10. Task 6 in Phase 4 must merge before Tasks 7 and 8 begin.
- Do not modify clinical ranking, scores, thresholds, gates, published rule-pack content, citations, or rule activation as a side effect of engineering-hygiene work.
- Preserve the approved-only rule activation invariant, the `apps/admin-worker` single-write-path invariant, and the de-identified-data-only invariant for V1 patient data.
- A behavior-preserving clinical refactor must keep the full clinical suite, including the 275,000-case stress campaign, green.
- Never invent a clinical threshold, dosing rule, or citation. New clinical values require an exact named guideline, year, and section or table.
- End every implementation task with whole-monorepo `pnpm typecheck` and `pnpm test`; Phase 0 tasks also require `pnpm lint` after Task 1 establishes it.
- Stop and return product or clinical-safety decisions to the project owner instead of guessing.

---

## 1. Product definition

GLYMIZE is intended to become a bilingual Persian/English clinical decision-support platform for diabetes management, with a primary focus on physicians practicing in Iran.

The system is designed to:

- receive a minimum set of anonymous patient information;
- identify an appropriate treatment pathway;
- rank medication options;
- explain why each option is presented;
- show cautions, limitations, and supporting guideline references;
- consider cost, insurance coverage, administration route, and availability in Iran;
- display generic products and approved Iranian brands;
- preserve the physician's responsibility for the final clinical decision.

GLYMIZE must remain a **clinical decision-support tool**, not an autonomous diagnosis or prescribing system.

---

## 2. Current repository architecture

GLYMIZE is a TypeScript monorepo using `pnpm` and Turborepo.

```text
apps/
  web/                 Next.js physician interface and admin panel
  api/                 NestJS/Fastify API
  admin-worker/        Cloudflare Worker for secure admin publishing

packages/
  clinical-engine/     Clinical pathway and medication ranking logic
  contracts/           Shared type-safe contracts

infra/
  postgres/            Initial PostgreSQL and multi-tenant infrastructure plans

docs/                  Product, clinical, governance, and architecture documents
```

### Core technologies

- TypeScript
- Node.js 22+
- pnpm
- Turborepo
- Next.js 16
- React 19
- NestJS 11
- Fastify
- Cloudflare Workers
- GitHub Actions
- GitHub Pages
- PostgreSQL architecture foundation

### Standard local commands

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm dev
```

Expected development endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Type 2 pathway: `http://localhost:3000/type-2`
- Admin panel: `http://localhost:3000/admin`

---

## 3. Current implemented capabilities

The repository is no longer documentation-only. Important working features already exist.

### Physician-facing application

- Clinical dashboard
- Type 2 diabetes assessment page
- Current HbA1c input
- Individual target HbA1c input
- HbA1c gap calculation
- eGFR input
- Initiation versus intensification workflow selection
- ASCVD, heart failure, CKD, hypoglycemia, weight, and insulin-pathway factors
- Oral-only versus oral-and-injectable preference
- Cost preference
- Insurance-aware medication display
- Medication ranking cards
- Clinical rationale and guideline link display
- PWA installation support

### Medication catalogue

- Generic medication records
- Therapeutic class and therapy-group classification
- Route of administration
- Iranian brand records
- Manufacturer and market metadata foundation
- Generic-first or brand-first display concepts
- Multiple active brand cards per generic medication
- Generic-level and brand-level insurance coverage
- Admin-added generic medications
- Excel import foundation

### Admin panel

- Medication visibility control
- Add, edit, and remove brands
- Brand display instead of generic
- Brand ordering
- Insurance provider and percentage configuration
- Local draft storage
- Central publishing through GitHub
- Direct `/admin` route without public navigation link

### Deployment and publishing

- Static Next.js deployment to GitHub Pages
- GitHub Actions build pipeline
- Typecheck and test execution before deployment
- PWA build version generation
- Service-worker version replacement
- Cloudflare Worker admin API
- GitHub OAuth authentication
- Restricted GitHub administrator account
- Publishing catalogue changes to:

```text
apps/web/public/data/admin-catalog.json
```

---

## 4. Current runtime models

GLYMIZE currently supports two different runtime modes.

### 4.1 Server/API mode

The web application communicates with the NestJS API. The API provides catalogue, guideline, admin, and Type 2 assessment endpoints.

Important endpoint groups include:

```text
GET    /v1/catalog/generics
POST   /v1/catalog/type-2/considerations
GET    /v1/protocols/type-2

GET    /v1/admin/catalog/medication-checklist
PATCH  /v1/admin/catalog/medication-checklist/:id
PATCH  /v1/admin/catalog/medication-checklist/:id/insurance
POST   /v1/admin/catalog/medication-checklist/:id/brands
PATCH  /v1/admin/catalog/medication-checklist/:id/brands/:brandId
DELETE /v1/admin/catalog/medication-checklist/:id/brands/:brandId
POST   /v1/admin/catalog/generics
POST   /v1/admin/catalog/imports
```

### 4.2 Static browser mode

GitHub Pages cannot run NestJS. For the public static deployment:

- medication seeds are bundled with the web app;
- the clinical engine runs in the browser;
- the published catalogue is loaded from JSON;
- local changes are stored in `localStorage`;
- authenticated admin changes are sent to the Cloudflare Worker;
- the Worker commits the catalogue JSON to GitHub;
- GitHub Actions rebuilds the PWA.

This is a practical prototype architecture, but it is not the intended final production architecture for a clinical system.

---

## 5. Current clinical engine behaviour

The clinical engine is isolated from presentation contracts, which is an important architectural strength. Medication presentation and brand selection should not alter the underlying clinical rule result.

### 5.1 Type 2 pathway logic

Current major pathway rules include:

#### Severe hyperglycemia / catabolic pathway

The engine highlights insulin consideration when one or more of the following are present:

- current HbA1c above 10%;
- clear symptoms of hyperglycemia;
- catabolic features.

#### HbA1c gap of at least 1.5 percentage points

The current implementation prioritizes a GLP-1-based or dual GIP/GLP-1 pathway when severe hyperglycemia is absent.

#### HbA1c above target but gap below 1.5

The engine returns either:

- single or stepwise therapy for initiation; or
- combination therapy for intensification.

#### HbA1c at or below target

The engine returns maintenance and monitoring.

### 5.2 Medication ranking

Medications currently start from a base score and gain or lose points based on factors such as:

- insulin pathway alignment;
- basal glargine preference;
- GLP-1 pathway alignment;
- HF and CKD benefit;
- ASCVD benefit;
- weight priority;
- hypoglycemia risk;
- eGFR;
- heart-failure cautions;
- relative cost;
- insurance coverage.

The score is constrained to a 0–100 range and translated into display tiers.

### Important interpretation

The current score is a **hand-authored heuristic ranking model**. It is not yet equivalent to:

- an official guideline strength-of-recommendation score;
- a validated prediction model;
- a clinically validated prescribing algorithm;
- an evidence-grade calculation.

---

## 6. Current data model summary

### Generic medication

Current fields include:

- internal ID
- canonical English name
- Persian name
- ATC code
- class name
- therapy group
- administration route
- catalogue status

### Therapy groups currently present

```text
oral_glucose_lowering
glp_1_receptor_agonist
dual_gip_glp_1_receptor_agonist
human_insulin
basal_insulin_analog
prandial_insulin_analog
premixed_insulin
fixed_ratio_combination
```

### Brand record foundation

- brand name
- Persian brand name
- manufacturer
- Iranian market
- availability
- review state
- source URL and source reference
- observation and verification dates

### Admin display configuration

- show/hide medication
- generic insurance coverage
- one or more brands
- show brand instead of generic
- brand priority
- inherited or custom brand insurance

---

## 7. Strong aspects of the project

The project already has several valuable foundations.

### Product and clinical strengths

- Clear decision-support positioning
- Explicit physician responsibility
- Anonymous-data-first approach
- Attention to Iranian market realities
- Insurance-aware display
- Cost-aware ranking
- Generic and brand separation
- Explanation and source display
- Clinical caution messaging

### Engineering strengths

- Monorepo architecture
- Shared TypeScript contracts
- Separate clinical-engine package
- PWA support
- Automated deployment
- Browser and API execution options
- Secure Worker-based publishing foundation
- Input and catalogue validation
- Version file and service-worker update support

### Governance strengths in documentation

The architecture documents correctly identify the need for:

- immutable rule bundles;
- versioned rules;
- clinical review;
- author/reviewer separation;
- audit records;
- rollback;
- PostgreSQL RLS;
- multi-organization support;
- no health data in product analytics;
- explainability and traceability.

---

## 8. Known inconsistencies and weaknesses

The following issues should be addressed one by one. Their order will be refined as the project progresses.

### 8.1 Incomplete GLYMIZE rebranding

The repository name is GLYMIZE, but old identities remain in the codebase:

- root package name `glymize`;
- package namespace `@glymize/*`;
- `GLYMIZE` strings;
- `glymize-browser-catalog-v2` localStorage key;
- `GLYMIZE-Admin-Worker` user agent;
- old wording in build, Worker, documentation, UI, and configuration files.

**Required outcome:** one consistent GLYMIZE identity across code, package names, storage keys, environment variables, metadata, UI, PWA, documentation, and deployment.

---

### 8.2 Unclear final product scope

The repository currently behaves as a broad Type 2 medication decision-support platform. Recent product decisions also considered temporarily limiting visible functionality to insulin conversion.

The final scope must explicitly state whether GLYMIZE V1 is:

1. a comprehensive Type 2 medication assistant;
2. an insulin-conversion tool;
3. a modular platform whose first active module is insulin conversion;
4. another clearly defined combination.

**Required outcome:** a single approved V1 product scope, reflected in navigation, routes, clinical engine, documentation, and tests.

---

### 8.3 GLP-1 and weight logic conflict

Current code still includes:

- GLP-1 and dual GIP/GLP-1 therapy groups;
- GLP-1-first logic for HbA1c gap ≥1.5%;
- weight-priority input;
- GLP-1 ranking bonuses;
- GLP-1 text in the interface;
- GLP-1 in triple-therapy content.

This conflicts with the more recent decision to temporarily hide or remove GLP-1 functionality and the weight input.

**Required outcome:** resolve the product decision and remove, hide, or retain these elements consistently across contracts, engine, UI, catalogue, admin, tests, and documentation.

---

### 8.4 Insulin-conversion module is not yet the central implemented workflow

The reviewed repository does not yet contain the complete insulin conversion workflow required by recent decisions, including:

- basal-to-basal conversion;
- mix-to-FRC conversion;
- Soliqua default destination;
- multiple daily injection handling;
- dose aggregation;
- permitted and prohibited category conversions;
- prevention of prandial-to-basal conversion;
- mix-to-FRC availability;
- clear source-based dose adjustment rules.

**Required outcome:** implement a dedicated, tested, traceable insulin conversion module if it remains inside GLYMIZE V1.

---

### 8.5 Heuristic scores are not evidence-grade rules

Current numeric bonuses and penalties are manually selected. Their meaning and evidence basis are not formally defined.

Examples include fixed values such as:

- insulin pathway bonus;
- glargine bonus;
- HF/CKD bonus;
- ASCVD bonus;
- heart-failure penalty;
- eGFR penalty;
- cost and insurance adjustments.

**Risks:**

- false precision;
- unexplained ranking changes;
- inability to defend why one medicine scored above another;
- cost or insurance accidentally overpowering a clinical safety concern;
- display tiers being mistaken for formal recommendation strength.

**Required outcome:** replace or formalize scoring through explicit, versioned, source-linked clinical rules with documented precedence.

---

### 8.6 Hard contraindications are mixed with soft ranking penalties

Some clinically blocking conditions currently reduce a score instead of preventing display or generating a hard block.

Example pattern:

```text
contraindication → negative score
```

Safer pattern:

```text
contraindication → blocked
major caution → explicit warning and lower rank
preference → rank adjustment
cost/insurance → presentation adjustment after safety
```

**Required outcome:** create a clear hierarchy:

1. hard clinical block;
2. urgent review;
3. major caution;
4. clinical preference;
5. patient preference;
6. affordability and insurance;
7. display ordering.

---

### 8.7 Current input set is insufficient for real prescribing support

The current Type 2 assessment does not yet cover all inputs potentially required for safe individualized recommendations.

Examples that may need inclusion or explicit exclusion from scope:

- current medications and doses;
- treatment duration;
- previous treatment failure;
- adverse reactions;
- age and frailty;
- pregnancy;
- history of DKA;
- liver disease;
- pancreatitis history;
- recurrent infection risk;
- volume status;
- UACR;
- BMI or weight status;
- patient preferences;
- actual local availability;
- drug interactions.

**Required outcome:** define a minimum safe input dataset per active clinical pathway.

---

### 8.8 Source traceability is too broad

Many rules currently refer to a general guideline section instead of a precise source location.

Each clinical rule should ideally include:

- guideline publisher;
- guideline version;
- recommendation/table/figure identifier;
- section and page when available;
- exact rule interpretation;
- source URL;
- access date;
- reviewer;
- rule version;
- expected test cases.

**Required outcome:** every active clinical rule becomes individually traceable and reviewable.

---

### 8.9 Browser and API logic may diverge

There are parallel implementations and data paths for:

- NestJS server mode;
- static browser fallback mode.

This can produce different outcomes depending on deployment mode.

**Required outcome:** define one source of truth for clinical logic and catalogue behaviour, with contract tests proving equivalent results across runtimes.

---

### 8.10 Cross-app imports create architectural coupling

The web application imports seed and source files from inside the API application tree.

This weakens boundaries between apps and increases build and maintenance risk.

**Required outcome:** move shared data, seeds, schemas, and rule bundles into dedicated packages.

Suggested direction:

```text
packages/
  clinical-engine/
  clinical-rules/
  medication-catalog/
  contracts/
  shared-config/
```

---

### 8.11 Local drafts can override the published catalogue

The browser prefers an existing local draft over the latest published state. An administrator may therefore see stale local data after a newer central publication.

**Required outcome:** introduce revision-aware draft handling:

- published revision;
- local draft base revision;
- conflict detection;
- restore published version;
- discard local draft;
- explicit save draft and publish actions.

---

### 8.12 Admin changes publish too automatically

Current changes can be scheduled for central publishing shortly after editing.

For clinical content, the expected workflow should be closer to:

```text
Edit → Save Draft → Validate → Review Changes → Approve → Publish
```

**Required outcome:** separate local editing, draft persistence, validation, clinical approval, and publication.

---

### 8.13 Admin security is not production-complete

Current strengths include OAuth, encrypted state/session, allowed-login restriction, CORS validation, payload validation, and path restriction.

Remaining limitations include:

- single-admin model;
- no complete RBAC;
- no author/reviewer separation;
- no independent append-only audit store;
- no organization-level permissions;
- no visible NestJS guards in the reviewed admin controller;
- direct catalogue publication to the main branch;
- limited session revocation model.

**Required outcome:** implement production identity, RBAC, approval separation, audit, and protected API routes before clinical deployment.

---

### 8.14 GitHub JSON publishing will not scale indefinitely

A single JSON file committed for every catalogue update is useful for the prototype, but will become difficult for:

- large Iranian medication datasets;
- frequent pricing changes;
- insurance history;
- review history;
- concurrent editors;
- rollback at record level;
- data validation and querying.

**Required outcome:** keep GitHub publishing for preview if useful, but move the production catalogue to a versioned database-backed service.

---

### 8.15 Triple-therapy display is not a true regimen builder

The current triple-therapy section displays generic examples when the HbA1c gap is large. It does not yet construct a patient-specific, contraindication-aware three-drug regimen.

**Required outcome:** either clearly label it as educational content or implement a validated regimen-composition engine.

---

### 8.16 Recommendation labels may imply excessive certainty

Labels such as “recommended” or “stronger suggestion” can be interpreted as formal guideline strength even though they currently derive from internal scoring.

**Required outcome:** use wording that distinguishes:

- guideline recommendation strength;
- system fit score;
- safety status;
- affordability;
- availability;
- clinician review requirement.

---

### 8.17 Clinical testing is not yet comprehensive enough

The project needs systematic rule-level and pathway-level testing.

Minimum future clinical test groups should include:

- HbA1c threshold boundaries;
- eGFR threshold boundaries;
- urgent hyperglycemia cases;
- contradictory patient preferences and clinical needs;
- HF with TZD;
- CKD with SGLT2;
- hypoglycemia-risk combinations;
- oral-only with insulin-required pathway;
- insured-only with no covered medicine;
- generic and multiple-brand outputs;
- brand-specific insurance;
- mix-to-FRC conversion;
- repeated daily insulin doses;
- deterministic output for the same rule bundle;
- historical rule-bundle replay;
- clinician-approved golden cases.

---

### 8.18 Documentation is ahead of implementation

The documented target architecture includes:

- immutable rule bundles;
- atomic activation;
- rollback;
- DecisionRecord;
- PostgreSQL RLS;
- object storage;
- queue workers;
- multi-organization tenancy;
- audit event store;
- clinical review workflow;
- canary publication.

Most of these are not yet the primary runtime implementation.

**Required outcome:** clearly mark each architectural item as:

- implemented;
- partially implemented;
- planned;
- deferred;
- out of scope.

### 8.19 No enforced repository-wide lint and format baseline

The monorepo has typechecking and tests, but no single root configuration that applies consistent lint and formatting rules across `apps/*` and `packages/*`. This permits avoidable drift and leaves CI unable to reject new lint violations.

**Required outcome:** establish Biome at the repository root, expose it through root and Turborepo `lint` tasks, make the existing tree pass with only baseline fixes, and enforce it in CI without opportunistic refactoring.

### 8.20 Pull requests do not share one universal validation gate

Existing workflows are branch- or purpose-specific. A change targeting `main` is not universally guaranteed to run install, typecheck, lint, and tests before merge.

**Required outcome:** add an additive `pull_request` workflow for `main` that runs all four gates while retaining existing specialized workflows.

### 8.21 `apps/web` lacks sufficient automated coverage

The web application needs focused unit coverage for its runtime clients and end-to-end coverage for admin login, Type 2 assessment, Care Team handoff persistence, and patient-portal record viewing. The Care Team handoff save failure recorded in `docs/IMPLEMENTATION_QUEUE_2026-08-15.md` item 4 remains a required regression target until a test proves the corrected behavior.

**Required outcome:** add a web test script consistent with the existing Vitest stack, cover pure client behavior and error paths, add Playwright journeys for the four named flows, diagnose the handoff failure, and ship its fix with a regression test.

### 8.22 Runtime authority and current implementation status are not explicit enough

The repository contains a Next.js static/browser surface, a NestJS API, and a Cloudflare Worker/D1/R2/KV runtime. Aspirational documents do not state plainly which runtime owns catalogue reads and writes, clinical evaluation, or patient/encounter data, and the README no longer describes the breadth of the implemented platform accurately.

**Required outcome:** publish a runtime-of-record ADR without changing behavior; document the actual status of `apps/api`; add a generated, factual `CURRENT_STATE.md` snapshot; link it from the README while preserving every existing safety disclaimer verbatim.

### 8.23 Patient-adjacent Worker authorization is not role-complete

Authentication centered on one allowed GitHub login does not provide per-route authorization or author/approver separation for patient-adjacent operations.

**Required outcome:** introduce at least `editor` and `approver` roles backed by migrated data, enforce permissions server-side at each affected route, prevent self-approval, and test unauthenticated, unauthorized, and route-specific denial paths. Any temporary exception for the catalogue publisher must be explicit.

### 8.24 Several modules have accumulated multiple responsibilities

The following files require behavior-preserving decomposition:

- `apps/admin-worker/src/platform-patient-record-v2.ts`;
- `apps/admin-worker/src/platform-patient-portal.ts`;
- `apps/api/src/catalog/global-reference-catalog.ts`;
- `apps/web/app/care-team/care-team-client.tsx`;
- `apps/web/lib/api-client.ts`.

**Required outcome:** split them into cohesive modules with clear public entry points, using `decision-graph-v2` as the structural reference and preserving or expanding equivalence tests.

### 8.25 Versioned and patch CSS obscures the styling source of truth

Files carrying suffixes such as `-v2`, `-v3`, `-legacy`, `-hotfix`, `-smoke-fixes`, or `-final` can contain overlapping rules and tokens whose precedence depends on import order.

**Required outcome:** keep design tokens in the three existing v3 token files, merge patch rules into maintained non-suffixed stylesheets, verify dashboard, Type 2, admin, Care Team, and portal screenshots, and remove superseded files rather than leaving dead CSS.

### 8.26 Production catalogue persistence remains undecided

The repository contains a PostgreSQL foundation, an active D1-backed Worker platform, and a Git-commit-JSON publication model. Implementing another storage path before choosing the production authority would deepen divergence.

**Required outcome:** compare PostgreSQL completion, D1 consolidation, and permanent Git-JSON operation against actual Iranian catalogue size, edit frequency, and portal growth; recommend one in an ADR. Implementation requires a later owner-confirmed task.

### 8.27 Two Type 2 engine implementations may serve different truths

`packages/clinical-engine/src/index.ts` contains the older score-based `scoreMedication` / `buildType2MedicationConsiderations` path, while `decision-graph-v2` contains the predicate, gate, objective, Pareto, policy, and composition engine validated by the 275,000-case campaign. The actual `/type-2` production call path has not been recorded in an authority decision.

**Required outcome:** first document the live call path and the validated engine without changing runtime behavior. If they differ, converge the live physician path on `decision-graph-v2` in a separate task and leave at most a behavior-tested compatibility adapter.

### 8.28 Clinical thresholds can be independently duplicated

Named values such as metformin eGFR contraindication `30`, severe-hyperglycemia HbA1c `10`, and combination-therapy HbA1c gap `1.5` can appear in both versioned rule-pack parameters and `decision-graph-v2` modules.

**Required outcome:** source shared thresholds from one approved, versioned parameter set. If that change cannot be made safely in one PR, add a consistency test that fails whenever equivalent named values diverge and document the temporary duplication.

### 8.29 Hard contraindications must be structural exclusions in every path

A compatibility or legacy path must never allow a hard-gated candidate to remain in the ranked result merely because a negative score usually places it below safer choices.

**Required outcome:** exclude candidates with `blockedBy` or an equivalent hard-gate failure from returned choices and prove with an adversarial regression case that score arithmetic cannot promote a contraindicated product.

### 8.30 Evidence Assistant indexing is not product- and dose-specific enough

Indexing only broad rule-pack domain descriptions cannot answer a product-dose question with the precise evidence already carried by safety and dose rules.

**Required outcome:** index `decision-graph-v2` safety and product-dose evidence, and test that a dose-specific query such as renal sitagliptin dosing returns the exact product-rule citation rather than only a generic domain source.

### 8.31 Multi-domain catalogue coverage must precede new clinical logic

The scenario engine already models cardiovascular, kidney, hypertension, and lipid domains, but the verified Iranian inventory must contain the therapies needed to satisfy those lanes before objective logic is enabled.

**Required outcome:** extend the existing three-source consensus pipeline with ACE inhibitors, ARBs, statins, finerenone, and spironolactone; include Iranian brand, price, and insurance evidence; apply existing domain tags; and test inventory-adapter classification. This data task must merge before §8.32 begins.

### 8.32 Blood-pressure, lipid, and new product-dose rules require precise sources

Blood-pressure and lipid objective identifiers exist, but activating them without named current thresholds and an inventory of eligible products would create ungrounded recommendations.

**Required outcome:** after §8.31, add guideline-sourced BP and lipid objective triggers, demonstrate supporting-regimen composition without duplicate therapy, add per-product dosing/titration evidence, and register every source in the guideline registry. Every number must cite the exact guideline year and section or table.

### 8.33 Scenario diversity and multi-domain stress evidence are incomplete

Returning a primary scenario plus two alternatives does not by itself prove meaningful diversity. Cardiac, renal, hypertension, and lipid pathways also require the same scale of randomized and adversarial safety validation used for glycemic behavior.

**Required outcome:** keep `topAlternativeCount: 2`, test that representative patients receive alternatives differing on a clinically meaningful axis, and extend the large-scale stress/regression campaign before enabling new domains for physician use.

---

## 9. Proposed step-by-step improvement sequence

The sequence below is the canonical order accepted on 2026-09-03. Numbered tasks in Phase 0, Phase 3, and Phase 4 are individually shippable units and require one PR each. Existing milestone roadmaps remain useful release records, but they do not override this safety and convergence order.

### Phase 0 — Engineering hygiene and documentation truth

#### Task 1 — Linting and formatting

- [x] Configure Biome once at the repository root for `apps/*` and `packages/*`.
- [x] Add root and Turborepo `lint` tasks.
- [x] Fix only violations required for a clean baseline.
- [x] Make CI fail on lint errors without changing clinical behavior.

#### Task 2 — CI on every pull request

- [x] Add an additive workflow for every pull request targeting `main`.
- [x] Run install, typecheck, lint, and tests.
- [x] Retain existing specialized workflows.

#### Task 3 — Tests for `apps/web`

- [x] Add a Vitest-compatible web `test` script.
- [x] Unit-test `api-client.ts`, `patient-record-v2-client.ts`, `portal-client.ts`, `runtime-client.ts`, and `admin-auth.ts`, focusing on pure behavior and failures.
- [x] Add Playwright coverage for admin login, ranked Type 2 submission, Care Team patient-handoff save, and patient-portal record viewing.
- [x] Diagnose and fix implementation-queue item 4's Care Team save failure with a regression test.

#### Task 4 — Runtime-of-record documentation

- [x] Add `docs/architecture/RUNTIME_OF_RECORD.md` covering catalogue read/write, clinical evaluation, and patient/encounter authorities.
- [x] State whether `apps/api` is active, legacy, or local-development-only and update its README.
- [x] Keep this task documentation-only.

#### Task 5 — Current-state documentation

- [x] Add `docs/CURRENT_STATE.md` with implemented, partial, and planned capabilities.
- [x] Add a script that counts web routes, test files, and Worker migrations and prints the doc's summary block.
- [x] Link the snapshot from `README.md` and update its product description while retaining safety disclaimers verbatim.

#### Task 6 — RBAC in `apps/admin-worker`

- [x] Replace login-only authorization on patient-adjacent routes with server-side `editor` and `approver` roles or a stronger equivalent.
- [x] Add the next numbered migration and per-route authorization tests.
- [x] Prove an editor cannot approve their own change and unauthorized requests fail.
- [x] Document any temporary catalogue-publication exception explicitly.

#### Task 7 — God-file decomposition

- [x] Decompose the five files listed in §8.24 into cohesive submodules.
- [x] Preserve their public API and behavior with equivalence tests.

#### Task 8 — CSS consolidation

- [x] Inventory versioned, legacy, final, hotfix, and smoke-fix stylesheets.
- [x] Consolidate tokens and overlapping rules into maintained sources of truth.
- [x] Screenshot-compare the five key surfaces and delete superseded files.

#### Task 9 — Production persistence decision for the catalogue

- [x] Add `docs/architecture/CATALOGUE_PERSISTENCE_DECISION.md` comparing PostgreSQL, D1, and permanent Git-JSON operation.
- [x] Recommend one option against actual scale and growth constraints.
- [x] Do not implement the migration until the owner confirms the decision.

### Phase 1 — Identity and scope stabilization

- [ ] Complete GLYMIZE rebranding
- [ ] Define the exact V1 product scope
- [ ] Decide the status of GLP-1 and weight functionality
- [ ] Decide whether insulin conversion is the first active module
- [ ] Update README and product-scope documentation
- [ ] Remove contradictory UI and documentation text

### Phase 2 — Clinical logic safety foundation

- [ ] Define rule precedence
- [ ] Separate hard blocks, cautions, preferences, cost, and display
- [ ] Replace unexplained score constants
- [ ] Create traceable rule metadata
- [ ] Define minimum safe inputs per pathway
- [ ] Add source versioning and review fields
- [ ] Add clinical golden cases

### Phase 3 — Clinical engine convergence

#### Task 1 — Determine and document the authoritative engine

- [ ] Trace `/type-2` through the web runtime to the exact clinical-engine entry point used today.
- [ ] Add `docs/architecture/CLINICAL_ENGINE_AUTHORITY.md` identifying both the live engine and the engine validated by the 275,000-case suite.
- [ ] Make no runtime change in this task.

#### Task 2 — Converge on `decision-graph-v2`

- [ ] Move the live Type 2 pathway to `decision-graph-v2/engine.ts` if Task 1 proves it is not already authoritative.
- [ ] Reduce the older score path to a tested adapter or remove it only after proving there are no consumers.
- [ ] Add an integration guard against reintroducing a second independent Type 2 scoring path.

#### Task 3 — Eliminate independent threshold duplication

- [ ] Inventory shared numeric thresholds across `rule-pack.ts`, `safety-rules.ts`, `policy.ts`, and `product-dose-rules.ts`.
- [ ] Prefer approved versioned rule-pack parameters as the runtime source of truth.
- [ ] If the full refactor is unsafe for one PR, add a named parameter-consistency test and document the deferred consolidation.

#### Task 4 — Structural exclusion for hard contraindications

- [ ] Filter hard-gated candidates from every returned/ranked compatibility result.
- [ ] Add an adversarial regression where moderate penalties on safe options cannot promote a contraindicated product.

#### Task 5 — Deepen Evidence Assistant's citation index

- [ ] Index per-product evidence from `safety-rules.ts` and `product-dose-rules.ts`.
- [ ] Prove a dose-specific question returns the specific product-rule citation.

### Phase 4 — Multi-domain scenario engine

#### Task 6 — Add cardiac, renal, hypertension, and lipid classes to the catalogue

- [ ] Extend the three-source Iranian consensus pipeline for ACE inhibitors, ARBs, statins, finerenone, and spironolactone.
- [ ] Preserve source evidence for brand, price, and insurance fields and apply existing clinical-domain tags.
- [ ] Test that `inventory-adapter.ts` classifies every new product in the expected RAAS-blocker, MRA, or statin lane.
- [ ] Merge this data task before Tasks 7 and 8.

#### Task 7 — Wire blood-pressure and lipid objectives into the engine

- [ ] Add only named, current guideline-sourced triggers to the existing `blood_pressure_control` and `lipid_risk_reduction` objectives.
- [ ] Test supporting-regimen composition and duplicate-therapy avoidance with Task 6 inventory.

#### Task 8 — Add guideline-grounded product-dose rules

- [ ] Add per-product dosing and titration rules for Task 6 classes using exact source sections or tables.
- [ ] Register each source in `guideline-registry.ts` for precise Evidence Assistant citation.

#### Task 9 — Verify true scenario diversity

- [ ] Keep `topAlternativeCount: 2` unless the owner makes a separate product decision.
- [ ] Test representative cost, organ-protection, and complexity preferences through `chooseDiverseAlternatives` / `diversityKeyV2`.
- [ ] Require the three scenarios to differ on at least one clinically meaningful axis.

#### Task 10 — Regression-test the new pathways at scale

- [ ] Extend randomized, synthetic, metamorphic, and adversarial validation to the new objectives and regimens.
- [ ] Treat the expanded stress campaign as a release gate before physician-facing activation.

### Phase 5 — Insulin conversion module, if confirmed in V1

- [ ] Define supported insulin categories
- [ ] Define prohibited conversions
- [ ] Implement basal conversions
- [ ] Implement mix-to-FRC conversion
- [ ] Keep Soliqua available for basal and mix source regimens
- [ ] Set intended default destination
- [ ] Handle multiple daily injections
- [ ] Aggregate doses safely
- [ ] Add dose reduction and rounding rules
- [ ] Add references and warnings
- [ ] Add complete tests

### Phase 6 — Shared architecture cleanup

- [ ] Move shared seeds out of `apps/api`
- [ ] Create shared catalogue/rule packages
- [ ] Eliminate browser/API behaviour divergence
- [ ] Add contract and equivalence tests
- [ ] Version all schemas
- [ ] Clarify runtime source of truth

### Phase 7 — Admin workflow and catalogue integrity

- [ ] Add explicit Save Draft
- [ ] Add validation screen
- [ ] Add difference review
- [ ] Add author and reviewer roles
- [ ] Add approve and publish steps
- [ ] Add revision conflict handling
- [ ] Add discard/restore controls
- [ ] Add catalogue history
- [ ] Add record-level source and verification metadata

### Phase 8 — Production backend foundation

- [ ] Connect PostgreSQL persistence
- [ ] Implement migrations
- [ ] Implement RLS and tenant boundaries
- [ ] Add identity provider integration
- [ ] Protect admin endpoints
- [ ] Add append-only audit records
- [ ] Add rule-bundle storage
- [ ] Add atomic publication and rollback
- [ ] Add decision record persistence

### Phase 9 — UI and brand redesign

- [ ] Apply the final GLYMIZE design system
- [ ] Add final logo and application icon
- [ ] Redesign welcome/dashboard experience
- [ ] Implement modern geometric English typography
- [ ] Implement compatible Persian typography
- [ ] Review RTL/LTR behaviour
- [ ] Review mirrored button and icon issues
- [ ] Improve clinical hierarchy and whitespace
- [ ] Review accessibility against WCAG 2.2 AA

### Phase 10 — Validation and release readiness

- [ ] Clinical review of each rule
- [ ] Usability testing with physicians
- [ ] Medication-catalogue verification for Iran
- [ ] Insurance data verification
- [ ] Security review and threat model
- [ ] Privacy and legal review
- [ ] Performance and offline testing
- [ ] PWA update reliability testing
- [ ] Incident and rollback procedure
- [ ] Release checklist and clinical disclaimer review

---

## 10. Recommended definition of done for each improvement

An improvement should not be marked complete until all relevant items below are satisfied:

- code implementation completed;
- typecheck passes;
- automated tests added and passing;
- clinical source documented when applicable;
- UI text updated in Persian and English;
- documentation updated;
- migration or backward compatibility considered;
- PWA/static and API runtime behaviour checked;
- security impact reviewed;
- no old brand terminology remains in modified scope;
- final behaviour manually verified.

---

## 11. Immediate next task

The immediate next task is:

> **Phase 0 / Task 8 — consolidate versioned, legacy, final, hotfix, and smoke-fix CSS into maintained sources of truth.**

The task must:

- inventory every versioned or patch-suffixed stylesheet under `apps/web/app`;
- consolidate tokens and overlapping rules into maintained source files;
- screenshot-compare the five key surfaces before deleting superseded files;
- preserve Persian RTL, English LTR, responsive, print, and accessibility behavior.

Phase 0 / Tasks 1–7 established linting, universal pull-request validation, web unit/E2E coverage, explicit runtime authority, a reproducible factual current-state snapshot, persisted request-time RBAC, and tested module boundaries for the five oversized files. The previously identified rebranding work remains in Phase 1.

---

## 12. Change log

### 2026-09-03

- Added the owner-approved suggestion-to-roadmap traceability matrix.
- Added engineering weaknesses §8.19–§8.26 and clinical convergence weaknesses §8.27–§8.33.
- Added the ordered Phase 0 engineering-hygiene program, Phase 3 clinical-engine convergence program, and Phase 4 multi-domain scenario program.
- Recorded one-PR-per-task, full-suite, clinical-source, and sequencing constraints.
- Completed Phase 0 / Task 1 with a pinned root Biome configuration, Turborepo package lint tasks, and lint gates in existing CI workflows.
- Completed Phase 0 / Task 2 with an additive `pull_request` workflow for frozen install, typecheck, lint, and tests.
- Completed Phase 0 / Task 3 with ten web unit tests, four critical-flow Playwright tests, and explicit Care Team Runtime error mapping.
- Completed Phase 0 / Task 4 with an accepted runtime-of-record ADR and an explicit local-development-only classification for `apps/api`.
- Completed Phase 0 / Task 5 with a generated repository inventory, a factual implemented/partial/planned snapshot, and an accurate multi-surface README introduction.
- Completed Phase 0 / Task 6 with migration `0018`, request-time patient-route roles, self-approval guards, authorization tests, and an explicit catalogue-publisher exception.
- Completed Phase 0 / Task 7 with compatibility façades, cohesive extracted modules, and public-behavior equivalence tests for all five named files.
- Set Phase 0 / Task 8 as the immediate next task.

### 2026-07-31

- Initial repository-wide overview recorded.
- Current architecture and implemented capabilities summarized.
- Major clinical, engineering, admin, security, product, and branding weaknesses listed.
- Initial phased remediation roadmap created.
