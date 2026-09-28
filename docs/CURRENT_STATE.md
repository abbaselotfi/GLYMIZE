# GLYMIZE Current State

Snapshot date: 2026-09-28
Repository baseline: canonical execution has advanced through the R30-03 reference-only Windows shell and the isolated R30-04-B1 SQLCipher synthetic-data spike. R30-03-C2 passed a real clean non-elevated Windows 11 x64 VM sequence with the NIC disconnected. R30-04-B1 then passed a pinned Windows native build plus correct/wrong/no-key, tamper, indexed lookup, WAL crash recovery, side-file canary and encrypted-backup tests on generated data. B1 is not connected to Tauri and does not add protected local PHI/auth, signing, sync, clinical parity or production acceptance. Type 2 Decision Graph v2 remains treatment authority; migration `0019` remains unapplied/default-off; incomplete R29 RC evidence stays open.

This document is a factual repository snapshot, not a product promise or replacement for the ordered [Project Overview and Roadmap](PROJECT_OVERVIEW_AND_ROADMAP.md). The remaining open roadmap families are status-classified in [Remaining Roadmap Re-baseline](REMAINING_ROADMAP_REBASELINE_2026-09-08.md); that audit does not convert implemented code into V1 scope or deployment claims. It describes code, routes, tests, migrations, workflow configuration, and checked-in default feature state present in the repository. It does not assert that an uninspected remote environment has been deployed or activated.

For runtime ownership, see the accepted [Runtime of Record](architecture/RUNTIME_OF_RECORD.md). For the physician-facing Type 2 clinical authority, see [Clinical Engine Authority](architecture/CLINICAL_ENGINE_AUTHORITY.md).

The current B1/B2/B3/C1 foundation status, remaining engineering, physician-evaluation state, environment activation state, B4/B5/B6 alias mapping, and Roadmap §28 execution progress are recorded in the [Roadmap Status Crosswalk](ROADMAP_STATUS_CROSSWALK_2026-09-09.md). That crosswalk is the current execution control and prevents completed foundations from being restarted under local task names.

## Generated repository inventory

Run `node scripts/generate-current-state.mjs` from the repository root to reproduce this block.

<!-- current-state:generated:start -->
| Repository fact | Count |
| --- | ---: |
| Web App Router entries | 29 (29 pages, 0 route handlers) |
| Automated test files | 181 (175 JS/TS, 6 Python) |
| SQL migration files | 24 (19 Worker/D1, 5 PostgreSQL foundation) |
<!-- current-state:generated:end -->

The counts are file inventory, not a claim that every route or migration is active in production. JS/TS test files include Vitest and Playwright files; Python tests cover the Iran drug-data tooling.

## Implemented

### Product surfaces

- The public README, landing page, application metadata and install manifest present GLYMIZE as a patient-centered, multispecialty clinical intelligence workspace. Diabetes is identified as the first mature module rather than the whole product boundary.
- A bilingual Next.js application with landing, account, dashboard, profile/security, Type 2, Type 1, pregnancy, Care Team, patient archive, Evidence Assistant, insulin tools, patient-facing Care Hub, and multi-page admin surfaces.
- A canonical patient entry at `/patient` with a patient-specific Care Hub shell separated from the physician/assistant application shell. The older `/portal` surface remains part of the repository for portal compatibility and patient-record access flows.
- Physician Patient Workspace surfaces for patient context/header, medication reconciliation, investigations/orders, lab trends, encounter timeline, and change summaries, backed by the existing patient-record runtime contracts rather than a second patient store. Longitudinal reads are bound to the active actor/practice/patient context: obsolete overlapping reads are cancelled/ignored, auth or practice changes invalidate visible patient state, and response version/scope plus nested workspace-consumed values are validated fail-closed before rendering.
- The physician 10-second Brief, Attention Now and current-finding previews consume one structural selection contract. Current observation means newest fact in the same exact Patient Core `factKey` series; historical source flags stay separately reviewable, current unverified findings are explicit, incompatible unit/specimen series are not collapsed, and preview overflow is expandable rather than silently omitted. Consequential facts expose source/provenance detail without inventing a clinical severity or resolution state.
- Longitudinal observation and timeline history load in bounded pages with explicit continuation. The initial page cannot masquerade as complete history, and the physician can request older history without replacing the current Patient Workspace context.
- R28-07 adds the typed canonical Clinical Module lifecycle/registry and a governed Patient Core → Type 2 context handoff. The navigation descriptor carries scope/revision metadata rather than clinical values; Type 2 re-reads Patient Core, revalidates practice/patient scope and source revisions, and requires explicit clinician confirmation before eligible candidate values touch the form. Missing/unverified/stale/incompatible required facts fail closed. Decision Graph v2 remains treatment authority, the legacy handoff remains compatible, and Type 1 demonstrates a second `read_only_context` registration without treatment authority or release eligibility.
- Patient-facing provider discovery, referral redemption, care-relationship, and scheduling UI foundations that consume capability-gated runtime contracts.
- App-shell session restoration and permission-aware navigation for physician and assistant users, plus patient-specific authentication/session boundaries.
- GitHub OAuth owner authentication for central catalogue publication and runtime-account authorization for permitted admin surfaces.
- PWA manifest generation, service-worker registration, offline/version handling, and responsive Persian RTL / English LTR presentation.

### Clinical and medication capabilities

- The physician-facing `/type-2` route uses `decision-graph-v2` as its configured live medication selection/ranking authority. The older score-based builder is retained only as an explicit unconfigured compatibility fallback, with integration guards against a second live scoring authority.
- Versioned rule-pack parameters are the authority for consolidated shared Type 2 thresholds covered by Phase 3 Task 3, and hard contraindications are structurally removed from legacy compatibility results rather than relying on score penalties.
- The Evidence Assistant indexes product- and dose-specific Decision Graph evidence while remaining isolated from clinical-engine decision authority (`engineInfluence: "none"`).
- R28-06 adds the isolated `patient-core-safety-readiness` Clinical Engine subpath. It consumes `PatientContextView`, declares `decisionAuthority: "none"`, and preserves collection/readiness state (`not_collected`, `not_available`, `partial`, `known_absent`, `present`; plus `unverified`, `freshness_unknown`, `stale`, `current`) without adding eligibility, contraindication, ranking, dose, treatment or clearance rules. Existing reviewed medication/product safety registries remain the clinical-rule authority.
- Patient Core medication reconciliation now preserves the immutable snapshot stage (`clinical_snapshot`, `care_team_snapshot`, `physician_review_snapshot`, `final_snapshot`) as source/reconciliation context. That stage is not a signed physician order or clinical-engine decision.
- The reviewed Iranian multidomain inventory includes the Phase 4 cardiac/renal/hypertension/lipid classes and supports sourced blood-pressure/lipid objectives, reviewed cardiometabolic product-dose rules, regimen-composition guards, and meaningful scenario-diversity checks.
- The deterministic clinical release gate covers 325,000 large-scale clinical, financial, metamorphic, adversarial-numeric, and multidomain cases/pairs across the established suites.
- Type 2 structured intake carries represented specialist contexts without promoting UI visibility into a diagnosis. Product-specific safety screening for the reviewed WEGOVY MASH path is version/product bound, collected as explicit Present/Absent/Unknown responses, and remains fail-closed for missing, stale, partial, or unknown data. A complete transport envelope is not global product clearance or a treatment order.
- The active Type 2 input-coverage contract marks all currently consumed inputs as collected/derived except `cardiovascular.nyha_class`; NYHA remains intentionally uncollected because no active downstream runtime consumer has been demonstrated.
- An insulin-regimen conversion workspace with direction-specific supported paths, dose arithmetic, explicit blocked conversions, warnings, and clinician-review framing remains in the repository.
- Versioned rule-pack, evidence registry, lab registry/parser, patient-document parser, Decision Graph v2, dose, cost, insurance, inventory, regimen, investigation, and specialist-escalation primitives are present in the clinical-engine package.
- A repository-published medication catalogue projection, browser draft/edit workflows, normalized import and master-registry review surfaces, and a Worker-only central publish command remain implemented. The production-persistence migration decision remains governed by [Catalogue Persistence Decision](architecture/CATALOGUE_PERSISTENCE_DECISION.md).

### Patient and practice runtime

- A Cloudflare Worker entry point combines admin publishing with runtime authentication, profile/team management, Evidence Assistant, Patient Record v2, portal, provider, referral, relationship, practice-context, and scheduling route modules.
- Worker/D1 migration files through `0019` are checked into the repository. Through `0018` they cover runtime accounts, longitudinal patients and encounters, immutable snapshot revisions, patient portal sessions, additive global patient identity, provider/referral/relationship foundations, practice contexts, availability, slot holds, appointments, appointment policy snapshots and practice-scoped patient-access roles. `0019_patient_core_allergy_problem_authority.sql` defines the accepted bounded Allergy/Problem authority schema but remains unapplied and behind the default-off rollout boundary.
- Patient Record v2 provides practice-scoped resolve/create, identifier attachment, monotonic file-number allocation, Care Team atomic intake, encounters, snapshot revisions, observations, archive, workspace reads, and reviewed compatibility bridges.
- The longitudinal Patient Core observation projection declares its eligible source universe as observations from the latest immutable snapshot revision per encounter. Rejected observations and `raw:*` keys are explicit intentional exclusions; an eligible row skipped for unusable key/value forces `partial`; decryption failure remains a hard read error. Projection diagnostics account for source, eligible, included, intentionally excluded, invalid-skipped, and truncated counts, with runtime accounting invariants preventing a silently false `complete` result. R28-04 additionally propagates the already-stored immutable observation `snapshot_revision` into fact provenance for source/audit display.
- R28-05 bounds the initial longitudinal projection: observations default to 80 items, timeline to 60 items, requested pages are capped at 200, and observation responses additionally use a 192 KiB byte budget. HMAC-signed continuation cursors are practice/patient/family/sourceVersion scoped. Mixed encounter/order timeline traversal and observation history are tested for no duplicates/omissions under the frozen source watermark. Timeline remains explicitly partial even after its currently exposed sources are exhausted.
- Runtime longitudinal-cost telemetry records only operational counts/timings/bytes rather than patient values. No cache or alternate datastore was added by R28-05.
- Request-time `editor`/`approver` authorization protects patient-adjacent Worker routes, with existing fine-grained permissions retained as a second gate and self-approval denied for encounter and reviewed legacy-link changes.
- Care Team OCR/manual intake and reviewed handoff creation include explicit create/update intent, duplicate-code guard, optimistic revision conflict handling, and actionable Runtime failure messages.
- A practice-local patient registry remains the clinical record. Global patient identity and verified legacy links are additive and do not replace or silently merge practice-local records.
- Legacy `patient_handoffs` reads and explicit promotion remain for compatibility; its create/update routes are retired.

### Engineering controls

- Repository-wide TypeScript typechecking, Biome linting, Vitest suites, the 325,000-case established clinical stress/release campaign, and Playwright critical-flow coverage are wired into validation.
- Every pull request targeting `main` runs frozen install, typecheck, lint, monorepo tests/stress suites, and critical Playwright flows; the PR template additionally requires explicit Roadmap and Graph Gate declarations. Direct pushes to `main` run the repository-wide lint/typecheck/test/Worker/current-web/Playwright validation lane so the owner-requested direct-main execution path cannot bypass engineering gates.
- R28-02 adds a modular Patient Workspace read guard and a separate longitudinal-response validator rather than extending the page component into a mixed concurrency/schema-validation module. Behavioral tests cover out-of-order patient responses, overlapping refreshes, actor/practice invalidation, current access failure, malformed nested payloads, unsupported versions, and patient/practice scope mismatch.
- R28-03 adds executable projection accounting and controlled reader tests. The tests cover missing/unusable eligible values, rejected/raw intentional exclusions, latest snapshot-revision scoping, practice/patient query binding, decryption failure, snapshot partial semantics, and preservation of the change detector rule that partial-family absence is not a removal.
- R28-04 adds a shared Patient Workspace current-selection module, separates rendering from the async/auth loader, adds reusable Source/Audit disclosure, propagates immutable observation revision provenance, and tests old-flag/new-normal ordering, repeated exact series, incompatible units/specimens, unverified findings and all preview-overflow paths. Validation run `34335565064` passed lint, typecheck, full regression, Worker build, current web build and Playwright critical flows.
- R28-05 adds bounded longitudinal readers, a separate pagination/cursor boundary, bounded timeline-order projection, non-PHI runtime read metrics, fail-closed history validators/merge logic and touch-friendly history continuation. PR validation run `34351829348` and direct-main validation run `34352391023` passed. Synthetic CI evidence shows initial medium/large reads remain bounded at 80 observations, 60 timeline rows, 9 measured queries, 144 decryptions and 22,054 response bytes even as source history grows from 400/300 to 4,000/3,000 rows. These runner measurements are not a production SLA.
- R28-06 non-authority implementation was validated in PR run `34354445235`, reapplied as the exact tested tree on `main@964d94fff808679a61d3845f2ac527185326f2df`, and passed direct-main run `34356760954`. Governance PR #137 added the Allergy/Problem authority ADR, passed validation run `34357808714`, and merged at `ebb0ed5a5d6e2e000bc6e78648c34fd6c7219186`; post-merge direct-main run `34358251203` and Codebase Memory run `34358251246` passed. The owner accepted Option A on 2026-09-10; exact implementation candidate `39a4fe2e4aa05d5447d12988252b76a0979fde02` passed local engineering/Graph gates and official PR validation run `34435784209` (#231), including monorepo tests and Playwright critical flows, and merged through PR #139 as `main@a753b9b914df2039a92b293b2638a47d1f9a9eeb`.
- R28-07 exact candidate `0af430a87aec5ca03607f4210e20d0d5f23528b9` passed PR validation `34440472004` (#244), the local exact-head POST Roadmap + Graph Gate, and merged through PR #141 as `main@f92aee7459ea5194d4b6dccbe3dc6a12f6ec6192`. Direct-main validation `34441361566` (#136) passed lint, typecheck, clinical/security regression, Worker build, current web build and Playwright critical flows; Codebase Memory snapshot `34441361551` (#63) also passed.
- Codebase Memory is pinned at `0.10.8` for the current graph-gate workflow, with PRE/POST graph checks used for graph-relevant tasks.
- The five previously oversized modules identified in roadmap §8.24 expose compatibility façades over cohesive archive, portal-media, generated-catalogue, Care Team form-model, and browser-catalogue state modules, with equivalence tests.
- Versioned/hotfix CSS identified by Phase 0 Task 8 was consolidated and superseded styling files were removed after screenshot comparison.
- Obsolete GitHub Pages deployment was retired; repository web/runtime deployment work now follows the Cloudflare/static-browser and Worker boundaries rather than claiming Pages as the active deployment path.

## Partial, gated, or disabled by default

- The [R30-04-B1 SQLCipher spike](R30_04_B1_SQLCIPHER_SPIKE_2026-09-28.md) accepts only the pinned isolated synthetic-data candidate. It exposes no renderer IPC and no runtime storage. B2 must review key/KDF/Stronghold/recovery protocol and the observed Windows locked-memory failure under Astra High; C integration remains gated by R30-05/07.
- R30-03 is complete only for the deterministic reference-only Windows shell and its clean-machine/full-blackout gate. Encrypted local records, Local Only workspace/authentication, shared clinical execution, sync, backup/recovery, trusted signing and full Clinic Host/PWA acceptance remain R30-04 onward and R31 work.
- Patient Identity v2, provider directory, referral service, care relationships, multi-practice patient contexts, scheduling availability, slot discovery, slot locking, and booking have schema/contracts/runtime tests and substantial UI/runtime implementation, but repository presence alone does not prove production activation. Their RC checkpoints and feature-capability surfaces must not be described as production availability without environment evidence.
- With the R28-06 rollout flag disabled, Patient Core retains the pre-authority snapshot fallback in which allergies/problems remain `not_available/source_not_exposed`. [`PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ADR.md`](architecture/PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ADR.md) records **Accepted — Option A** on 2026-09-10. The selected authority is dedicated bounded longitudinal Allergy/Problem persistence inside the existing Worker/D1 Patient Record v2 runtime of record with explicit reconciliation and append-only revisions. Migration `0019` application, rollout activation and external deployment remain separately gated.
- Patient Core medication state is currently derived from immutable encounter-snapshot reconciliation, while cross-cutting contexts are a bounded snapshot flag subset. Shared freshness remains `unknown` unless a reviewed clinical-use-specific policy supplies versioned current/stale semantics; there is no universal cutoff.
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
- Roadmap §28 R28-01 through R28-07 are complete in repository history. R28-07 exact candidate `0af430a87aec5ca03607f4210e20d0d5f23528b9` implemented the governed Clinical Module registry/handoff boundary, passed PR CI #244 and the local exact-head POST Roadmap + Graph Gate, then merged through PR #141 as `main@f92aee7459ea5194d4b6dccbe3dc6a12f6ec6192`; direct-main validation #136 and Codebase Memory snapshot #63 passed. Type 2 Decision Graph v2 remains treatment authority, Type 1 is a read-only registration proof only, migration `0019` remains unapplied/default-off, and no external deployment is authorized.
- Remaining unchecked roadmap phases contain a mix of genuinely planned work, already-partial implementation, and owner/product/clinical decisions. They require the execution ordering in canonical Roadmap §28 and this document's stated continuation boundary rather than treating any unchecked historical item as automatically next.

## Immediate continuation boundary

**September 28 superseding checkpoint:** [B2 review findings](architecture/KEY_CUSTODY_R30_04_B2_REVIEW.md) are recorded; B2 remains open. B1 is binary-passphrase evidence, not raw-key proof. Next model checkpoint is **Sol High** for corrected raw-key and bounded memory/Stronghold feasibility probes; then bounded Astra High protocol finalization, then Sol High custody implementation. This supersedes the historical model checkpoint, not its retained safety gates. No runtime/PHI/migration/deployment change.

**R30-04-B1 observations are retained only for the isolated binary-passphrase candidate; protected storage is not implemented.** [The evidence and correction](R30_04_B1_SQLCIPHER_SPIKE_2026-09-28.md) preserve the R30-04-A workspace-key/offline-recovery obligations. Raw-key proof and final B2 custody acceptance remain pending. C integration depends on R30-05/07 contracts. R30-04 and dependent R31 capabilities remain open.

The accepted C2 evidence is not authorization to add PHI to the reference shell or to activate a migration, local AI provider, sync path, protected feature or production deployment. R29-01 through R29-05 remain open wherever their RC CPU/latency/rows, cache activation, D1 replication/bookmarks, query/index benefit, Turnstile/Smart Placement or rollback evidence is still missing.

Migration `0019`, Allergy/Problem runtime activation, backfill, unrelated clinical/freshness-policy changes and production deployment remain separately gated.

During that sequence:

- do not collect NYHA merely to remove the last Type 2 UI gap without a demonstrated downstream consumer;
- do not implement the catalogue storage migration without the owner confirmation required by its ADR;
- do not apply migration `0019`, enable the Patient Core Allergy/Problem authority flag, or deploy that authority externally without the separate rollout/environment authorization;
- do not invent clinical thresholds, contraindications, dose rules, evidence, freshness cutoffs, or product scope to satisfy an unchecked roadmap box.

## Safety status

GLYMIZE remains pre-clinical decision-support software under active development. Implemented output must not be interpreted as autonomous diagnosis or prescribing, and features that are present behind default-off flags or only validated in RC must not be described as deployed or available without separate environment evidence.
