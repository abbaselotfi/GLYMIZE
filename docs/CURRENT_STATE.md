# GLYMIZE Current State

Snapshot date: 2026-09-09
Repository baseline: `main` at `fa275156e250244180cc9bd2b846590652bc3a7c` before the R28-01 status reconciliation.

This document is a factual repository snapshot, not a product promise or replacement for the ordered [Project Overview and Roadmap](PROJECT_OVERVIEW_AND_ROADMAP.md). The remaining open roadmap families are status-classified in [Remaining Roadmap Re-baseline](REMAINING_ROADMAP_REBASELINE_2026-09-08.md); that audit does not convert implemented code into V1 scope or deployment claims. It describes code, routes, tests, migrations, workflow configuration, and checked-in default feature state present in the repository. It does not assert that an uninspected remote environment has been deployed or activated.

For runtime ownership, see the accepted [Runtime of Record](architecture/RUNTIME_OF_RECORD.md). For the physician-facing Type 2 clinical authority, see [Clinical Engine Authority](architecture/CLINICAL_ENGINE_AUTHORITY.md).

The current B1/B2/B3/C1 foundation status, remaining engineering, physician-evaluation state, environment activation state, and B4/B5/B6 alias mapping are recorded in the [Roadmap Status Crosswalk](ROADMAP_STATUS_CROSSWALK_2026-09-09.md). That crosswalk is the execution control for R28-01 and prevents completed foundations from being restarted under local task names.

## Generated repository inventory

Run `node scripts/generate-current-state.mjs` from the repository root to reproduce this block.

<!-- current-state:generated:start -->
| Repository fact | Count |
| --- | ---: |
| Web App Router entries | 29 (29 pages, 0 route handlers) |
| Automated test files | 160 (154 JS/TS, 6 Python) |
| SQL migration files | 23 (18 Worker/D1, 5 PostgreSQL foundation) |
<!-- current-state:generated:end -->

The counts are file inventory, not a claim that every route or migration is active in production. JS/TS test files include Vitest and Playwright files; Python tests cover the Iran drug-data tooling.

## Implemented

### Product surfaces

- The public README, landing page, application metadata and install manifest present GLYMIZE as a patient-centered, multispecialty clinical intelligence workspace. Diabetes is identified as the first mature module rather than the whole product boundary.
- A bilingual Next.js application with landing, account, dashboard, profile/security, Type 2, Type 1, pregnancy, Care Team, patient archive, Evidence Assistant, insulin tools, patient-facing Care Hub, and multi-page admin surfaces.
- A canonical patient entry at `/patient` with a patient-specific Care Hub shell separated from the physician/assistant application shell. The older `/portal` surface remains part of the repository for portal compatibility and patient-record access flows.
- Physician Patient Workspace surfaces for patient context/header, medication reconciliation, investigations/orders, lab trends, encounter timeline, and change summaries, backed by the existing patient-record runtime contracts rather than a second patient store.
- Patient-facing provider discovery, referral redemption, care-relationship, and scheduling UI foundations that consume capability-gated runtime contracts.
- App-shell session restoration and permission-aware navigation for physician and assistant users, plus patient-specific authentication/session boundaries.
- GitHub OAuth owner authentication for central catalogue publication and runtime-account authorization for permitted admin surfaces.
- PWA manifest generation, service-worker registration, offline/version handling, and responsive Persian RTL / English LTR presentation.

### Clinical and medication capabilities

- The physician-facing `/type-2` route uses `decision-graph-v2` as its configured live medication selection/ranking authority. The older score-based builder is retained only as an explicit unconfigured compatibility fallback, with integration guards against a second live scoring authority.
- Versioned rule-pack parameters are the authority for consolidated shared Type 2 thresholds covered by Phase 3 Task 3, and hard contraindications are structurally removed from legacy compatibility results rather than relying on score penalties.
- The Evidence Assistant indexes product- and dose-specific Decision Graph evidence while remaining isolated from clinical-engine decision authority (`engineInfluence: "none"`).
- The reviewed Iranian multidomain inventory includes the Phase 4 cardiac/renal/hypertension/lipid classes and supports sourced blood-pressure/lipid objectives, reviewed cardiometabolic product-dose rules, regimen-composition guards, and meaningful scenario-diversity checks.
- The deterministic clinical release gate covers 325,000 large-scale clinical, financial, metamorphic, adversarial-numeric, and multidomain cases/pairs across the established suites.
- Type 2 structured intake carries represented specialist contexts without promoting UI visibility into a diagnosis. Product-specific safety screening for the reviewed WEGOVY MASH path is version/product bound, collected as explicit Present/Absent/Unknown responses, and remains fail-closed for missing, stale, partial, or unknown data. A complete transport envelope is not global product clearance or a treatment order.
- The active Type 2 input-coverage contract marks all currently consumed inputs as collected/derived except `cardiovascular.nyha_class`; NYHA remains intentionally uncollected because no active downstream runtime consumer has been demonstrated.
- An insulin-regimen conversion workspace with direction-specific supported paths, dose arithmetic, explicit blocked conversions, warnings, and clinician-review framing remains in the repository.
- Versioned rule-pack, evidence registry, lab registry/parser, patient-document parser, Decision Graph v2, dose, cost, insurance, inventory, regimen, investigation, and specialist-escalation primitives are present in the clinical-engine package.
- A repository-published medication catalogue projection, browser draft/edit workflows, normalized import and master-registry review surfaces, and a Worker-only central publish command remain implemented. The production-persistence migration decision remains governed by [Catalogue Persistence Decision](architecture/CATALOGUE_PERSISTENCE_DECISION.md).

### Patient and practice runtime

- A Cloudflare Worker entry point combines admin publishing with runtime authentication, profile/team management, Evidence Assistant, Patient Record v2, portal, provider, referral, relationship, practice-context, and scheduling route modules.
- D1 migrations through `0018` include runtime accounts, longitudinal patients and encounters, immutable snapshot revisions, patient portal sessions, additive global patient identity, provider/referral/relationship foundations, practice contexts, availability, slot holds, appointments, appointment policy snapshots, and practice-scoped patient-access roles.
- Patient Record v2 provides practice-scoped resolve/create, identifier attachment, monotonic file-number allocation, Care Team atomic intake, encounters, snapshot revisions, observations, archive, workspace reads, and reviewed compatibility bridges.
- Request-time `editor`/`approver` authorization protects patient-adjacent Worker routes, with existing fine-grained permissions retained as a second gate and self-approval denied for encounter and reviewed legacy-link changes.
- Care Team OCR/manual intake and reviewed handoff creation include explicit create/update intent, duplicate-code guard, optimistic revision conflict handling, and actionable Runtime failure messages.
- A practice-local patient registry remains the clinical record. Global patient identity and verified legacy links are additive and do not replace or silently merge practice-local records.
- Legacy `patient_handoffs` reads and explicit promotion remain for compatibility; its create/update routes are retired.

### Engineering controls

- Repository-wide TypeScript typechecking, Biome linting, Vitest suites, the 325,000-case established clinical stress/release campaign, and Playwright critical-flow coverage are wired into validation.
- Every pull request targeting `main` runs frozen install, typecheck, lint, monorepo tests/stress suites, and critical Playwright flows; the PR template additionally requires explicit Roadmap and Graph Gate declarations.
- Codebase Memory is pinned at `0.10.8` for the current graph-gate workflow, with PRE/POST graph checks used for graph-relevant tasks.
- The five previously oversized modules identified in roadmap §8.24 expose compatibility façades over cohesive archive, portal-media, generated-catalogue, Care Team form-model, and browser-catalogue state modules, with equivalence tests.
- Versioned/hotfix CSS identified by Phase 0 Task 8 was consolidated and superseded styling files were removed after screenshot comparison.
- Obsolete GitHub Pages deployment was retired; repository web/runtime deployment work now follows the Cloudflare/static-browser and Worker boundaries rather than claiming Pages as the active deployment path.

## Partial, gated, or disabled by default

- Patient Identity v2, provider directory, referral service, care relationships, multi-practice patient contexts, scheduling availability, slot discovery, slot locking, and booking have schema/contracts/runtime tests and substantial UI/runtime implementation, but repository presence alone does not prove production activation. Their RC checkpoints and feature-capability surfaces must not be described as production availability without environment evidence.
- The checked-in Worker configuration keeps `PATIENT_PORTAL_V1_ENABLED` at `false`.
- Type 1 and pregnancy pages provide informational/checklist and catalogue surfaces; they are not complete autonomous treatment pathways.
- Evidence Assistant generated-model operation depends on configured runtime providers/secrets and cannot alter the clinical engine's ranking/execution authority.
- Scheduling stores provider-neutral financial snapshots; no payment-processor integration is claimed.
- The NestJS `apps/api` service remains local-development-only compatibility code with in-memory state and no repository production deployment.
- PostgreSQL migrations are an architecture foundation, not the current patient/encounter runtime record.
- The catalogue-persistence ADR is complete, but the migration it recommends is intentionally not implemented until the owner confirms that separate production-authority decision.

## Canonical roadmap status

- Phase 0 Tasks 1–9 are complete.
- Phase 3 Tasks 1–5 are complete. The live Type 2 authority convergence, threshold consolidation, structural hard-exclusion firewall, and product/dose evidence indexing were merged in PRs #37–#41.
- Phase 4 Tasks 6–10 are complete. The verified multidomain catalogue, reviewed cardiometabolic dose protocols, BP/lipid objective wiring, scenario-diversity acceptance, and expanded multidomain release gate were merged through PRs #42 and #47–#50. Task 6 merged before both clinical-logic tasks; after the first Task 7 attempt exposed an ordering dependency, Task 8 dose protocols were completed before the final Task 7 objective activation.
- Subsequent Type 2 hardening through PR #116 added structured specialist intake, authority/coverage truth contracts, runtime parity, current-medication interval reconciliation, insurer/claims boundaries, WEGOVY MASH protocol/product-safety convergence, authoritative safety metadata, and active UI collection without changing the completed Phase 3/4 task definitions.
- Remaining unchecked roadmap phases contain a mix of genuinely planned work, already-partial implementation, and owner/product/clinical decisions. They require a fresh remaining-roadmap re-baseline before another unchecked item is treated as the next implementation task.

## Immediate continuation boundary

R28-01 status reconciliation is complete in the [Roadmap Status Crosswalk](ROADMAP_STATUS_CROSSWALK_2026-09-09.md). The next implementation sequence is R28-02 and R28-03, followed by R28-04/R28-05/R28-06, R28-07, R28-08 and R28-09 as ordered in canonical Roadmap §28.4.

During that sequence:

- do not collect NYHA merely to remove the last Type 2 UI gap without a demonstrated downstream consumer;
- do not implement the catalogue storage migration without the owner confirmation required by its ADR;
- do not invent clinical thresholds, contraindications, dose rules, evidence, or product scope to satisfy an unchecked roadmap box.

## Safety status

GLYMIZE remains pre-clinical decision-support software under active development. Implemented output must not be interpreted as autonomous diagnosis or prescribing, and features that are present behind default-off flags or only validated in RC must not be described as deployed or available without separate environment evidence.
