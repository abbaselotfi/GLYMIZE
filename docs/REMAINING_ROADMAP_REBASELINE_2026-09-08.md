# GLYMIZE Remaining Roadmap Re-baseline — 2026-09-08

- **Repository baseline:** `main@9db6677579c7d239c498098d087ecbe0c3af8b50`
- **Purpose:** classify the still-open Phase 1, Phase 2, and Phase 5–10 roadmap items against the repository that exists now, after Phase 3/4 convergence and the 2026-09-08 Current State truth-sync.
- **Scope:** documentation audit only. This document does not activate a feature, change a clinical rule, approve a product decision, or claim deployment.

## Status vocabulary

- **Implemented:** the stated engineering behavior is already present and has direct source/test or merged-PR evidence. This does not automatically mean production activation or clinical release acceptance.
- **Partial:** meaningful implementation exists, but the roadmap item is broader than the proven implementation or still has an explicit remaining boundary.
- **Owner decision required:** implementation choices depend on an unresolved product/architecture decision and must not be guessed from existing code.
- **Planned / deferred:** the target is not the current runtime authority or lacks enough implementation evidence to call it partial.

A broad roadmap checkbox should remain open when only part of its meaning is implemented. Existing code is not, by itself, evidence that a feature belongs in V1.

---

## Phase 1 — Identity and scope stabilization

| Roadmap item | Re-baselined status | Evidence / remaining boundary |
| --- | --- | --- |
| Complete GLYMIZE rebranding | **Partial** | GLYMIZE product branding, logo/icon assets and current patient/clinician surfaces exist, but historical package/runtime identifiers such as the `@glymize/*` namespace and compatibility storage/runtime names remain. Renaming technical compatibility identifiers requires a separate migration/compatibility review rather than a cosmetic sweep. |
| Define the exact V1 product scope | **Owner decision required** | The repository currently contains Type 2 Decision Graph CDS, Patient Care Hub/Workspace, insulin tools, Care Team, portal and admin capabilities. Code breadth cannot decide which subset constitutes V1. |
| Decide the status of GLP-1 and weight functionality | **Owner decision required** | Current Type 2 authority contains active GLP-1/WEGOVY pathways, including reviewed MASH product/dose/safety handling merged through PRs #53–#57 and #98–#116. Removing or hiding them would now be a product/clinical-scope decision, not cleanup. |
| Decide whether insulin conversion is the first active module | **Owner decision required** | A substantial insulin-conversion engine and UI already exist, but implementation maturity does not establish launch priority. |
| Update README and product-scope documentation | **Partial / blocked by owner decision** | Runtime and current-state documentation have been materially updated, but a final V1 scope statement cannot be written until the preceding product decisions are made. |
| Remove contradictory UI and documentation text | **Partial / blocked by owner decision** | Many stale runtime/engine statements were already corrected; product-scope contradictions involving GLP-1, weight and first-module priority cannot be resolved safely before V1 scope is approved. |

### Phase 1 gate

The next irreversible product-scope work should not infer owner intent from implementation history. The minimum owner decision is one explicit V1 scope statement covering:

1. whether physician-facing Type 2 CDS is in V1;
2. whether GLP-1/weight/MASH pathways remain visible in V1;
3. whether insulin conversion is a primary/first module or simply one module in the platform;
4. which Patient Care Hub/Workspace capabilities are in the V1 release claim versus implemented-but-gated.

---

## Phase 2 — Clinical logic safety foundation

| Roadmap item | Re-baselined status | Evidence / remaining boundary |
| --- | --- | --- |
| Define rule precedence | **Implemented — live Type 2** | `docs/architecture/CLINICAL_RULE_PRECEDENCE.md` records the configured Decision Graph precedence and the explicit unconfigured/admin-preview/local-development legacy-score exceptions; `type2-live-authority-v2.test.ts` guards those boundaries. Broader non-Type-2 modules remain subject to their own authority reviews. |
| Separate hard blocks, cautions, preferences, cost, and display | **Partial — strong on live Type 2** | Phase 3/4 work structurally excludes hard contraindications, keeps specialist/parallel-safety lanes outside ranking, and separates cost/access from clinical authority. The broad roadmap item spans more than the live Type 2 path and should remain open until the precedence model is formally documented across supported modules. |
| Replace unexplained score constants | **Implemented — clinical-engine authority boundary** | The retained Type 2 aggregate-score and legacy scenario modifiers are now named in `TYPE2_LEGACY_SCORE_POLICY_V1` as frozen `compatibility_only` mechanics; Rule Pack clinical weights remain separately versioned/reviewed. Evidence Assistant token relevance weights are also named and explicitly remain retrieval-only, not treatment authority. Decision Graph v2 does not consume the compatibility policy. |
| Create traceable rule metadata | **Implemented — live Type 2 authority boundary** | `docs/architecture/CLINICAL_RULE_METADATA.md` defines the provenance contract. Guideline-derived live Type 2 objectives, clinical missing-data requirements, hard/safety rules, dose/titration protocols, and reviewed product-safety sets now carry stable identity plus reviewed evidence metadata; intentionally evidence-empty neutral/request-policy structures are explicitly documented and regression-tested. This status does not claim universal metadata governance for unrelated future modules. |
| Define minimum safe inputs per pathway | **Partial — machine-readable Type 2 coverage present** | The Type 2 input contract/capability registry and active UI coverage map define required/request/derived boundaries. `cardiovascular.nyha_class` intentionally remains uncollected because no active downstream consumer has been demonstrated; it must not be collected merely to close a coverage gap. |
| Add source versioning and review fields | **Implemented — live Type 2 authority boundary** | `EvidenceReferenceV2.version` is required across live Decision Graph evidence; medication/safety gates, regimen conflicts, insulin-conversion edges, dose/titration protocols, regimen templates, FRC protocol bindings, and reviewed product-safety authorities carry explicit review/version identity where they bear live Type 2 authority. Live gate/conflict/conversion consumers apply only `approved` rules. This does not claim universal governance for unrelated modules or future schemas. |
| Add clinical golden cases | **Partial** | The repository has extensive deterministic, boundary, metamorphic, adversarial and randomized clinical tests, including the expanded multidomain stress campaign. A formal clinician-approved golden-case governance set with review/sign-off is not yet proven. |

### Phase 2 next engineering closure

With live Type 2 precedence, compatibility-score boundaries, rule-metadata provenance, and source/review lifecycle now formalized, the safest remaining Phase 2 work is governance/consolidation: close only proven minimum-safe-input gaps with active consumers, complete the broader hard-block/caution/preference/cost/display separation boundary where still unproven, and define clinician-approved golden-case governance. New clinical values still require exact reviewed evidence.

---

## Phase 5 — Insulin conversion module, if confirmed in V1

The implementation is much farther ahead than the unchecked checklist suggests. `packages/clinical-engine/src/insulin-conversion.ts`, `apps/web/app/insulin-tools/insulin-tools-client.tsx`, and `packages/clinical-engine/test/insulin-conversion.test.ts` already provide the core module and regression coverage.

| Roadmap item | Re-baselined status | Evidence / remaining boundary |
| --- | --- | --- |
| Define supported insulin categories | **Implemented in module** | Conversion categories and source/target compatibility are explicit in the clinical engine. |
| Define prohibited conversions | **Implemented in module** | Unsupported/unsafe category transitions are rejected rather than silently converted. |
| Implement basal conversions | **Implemented in module** | Basal conversion paths are represented and tested. |
| Implement mix-to-FRC conversion | **Implemented in module** | Premix-to-fixed-ratio-combination flow is present. |
| Keep Soliqua available for basal and mix source regimens | **Implemented in module/UI** | Soliqua/FRC destination handling is present for supported basal/premix contexts. |
| Set intended default destination | **Partial / owner-scope sensitive** | UI/engine defaults exist for supported flows, but the intended V1 product default remains a product decision and must not be inferred globally. |
| Handle multiple daily injections | **Implemented in module** | Multiple administrations can be represented for supported conversion paths. |
| Aggregate doses safely | **Implemented in module** | Source doses are aggregated under explicit conversion logic rather than string inference. |
| Add dose reduction and rounding rules | **Implemented in module** | Reduction/rounding behavior and safeguards are explicit and tested. |
| Add references and warnings | **Implemented in module/UI** | Conversion output carries warnings/references/clinician-review framing. |
| Add complete tests | **Partial — strong automated coverage** | The current insulin conversion regression suite contains 29 tests, but “complete” for release also requires the Phase 10 clinical/usability/release acceptance gates. |

**Important:** these implementation statuses do not answer the Phase 1 question of whether insulin conversion belongs in V1 or is the first active module.

---

## Phase 6 — Shared architecture cleanup

| Roadmap item | Re-baselined status | Evidence / remaining boundary |
| --- | --- | --- |
| Move shared seeds out of `apps/api` | **Planned** | The accepted Runtime of Record explicitly notes that web build-time code still imports catalogue/guideline seeds from `apps/api/src`; the NestJS process remains local-development-only. |
| Create shared catalogue/rule packages | **Partial** | `packages/clinical-engine` and `packages/contracts` already centralize major clinical/contracts authority, but catalogue seed ownership is still split and has not been fully neutralized. |
| Eliminate browser/API behaviour divergence | **Partial** | Type 2 live authority and parallel-safety parity were substantially converged, but the repository still intentionally contains browser-owned catalogue routes and a local-development-only NestJS compatibility surface. Repository-wide equivalence is not complete. |
| Add contract and equivalence tests | **Partial — extensive coverage exists** | Multiple compatibility/equivalence guards exist, including extracted module behavior, live Decision Graph authority and browser/runtime parity. The broad architecture item remains open until shared boundaries are fully consolidated. |
| Version all schemas | **Partial** | Rule/evidence/product-safety and several runtime contracts are versioned, but no proof exists that every public/storage schema has a formal version/migration policy. |
| Clarify runtime source of truth | **Implemented** | `docs/architecture/RUNTIME_OF_RECORD.md` is accepted; `docs/architecture/CLINICAL_ENGINE_AUTHORITY.md` records live Type 2 Decision Graph authority. This is the clearest Phase 6 item that can be treated as already complete at the documentation level. |

---

## Phase 7 — Admin workflow and catalogue integrity

| Roadmap item | Re-baselined status | Evidence / remaining boundary |
| --- | --- | --- |
| Add explicit Save Draft | **Partial** | Browser catalogue editing has an explicit local draft boundary; it is device-local and not shared authoritative staging. A production multi-editor draft workflow is not complete. |
| Add validation screen | **Partial** | Admin data-update/preflight validation surfaces exist, but this is not yet one universal catalogue publication validation gate with server-side staged records. |
| Add difference review | **Partial** | Review/diff concepts and Git publication history exist; a first-class record-level difference-review workflow for authoritative catalogue staging is not complete. |
| Add author and reviewer roles | **Partial** | Patient-adjacent Worker routes have persisted `editor`/`approver` RBAC and self-approval guards. The catalogue publisher remains a documented exception/single-owner publication boundary. |
| Add approve and publish steps | **Partial** | Central publish through the Worker/Git exists, but catalogue author→reviewer→approve→publish separation is not fully implemented. |
| Add revision conflict handling | **Partial** | Optimistic revision conflict handling exists in Care Team/Patient Record workflows; equivalent authoritative catalogue staging/revision conflict handling is not established. |
| Add discard/restore controls | **Planned / limited local behavior only** | Local drafts can be replaced/cleared, but authoritative record-level discard/restore is not implemented as a governed catalogue workflow. |
| Add catalogue history | **Partial** | Git history is the central publication record, but record-level catalogue revision history is an explicit reason the persistence ADR recommends D1 consolidation. |
| Add record-level source and verification metadata | **Partial — substantial data foundation** | Iranian market/catalogue records carry source/verification metadata, but the future authoritative editing store and universal record-history workflow remain unresolved. |

The proposed catalogue persistence ADR recommends **D1 consolidation with generated Git-JSON read artifacts**, but its status remains **awaiting owner confirmation**. Phase 7 should not create a second staging store before that architecture decision is approved.

---

## Phase 8 — Production backend foundation

| Roadmap item | Re-baselined status | Evidence / remaining boundary |
| --- | --- | --- |
| Connect PostgreSQL persistence | **Planned / deferred** | PostgreSQL is an architecture foundation, not the current patient/catalogue runtime record. The Worker/D1 platform is the current patient/encounter authority. |
| Implement migrations | **Partial** | D1 has 18 runtime migrations and PostgreSQL has 5 foundation migrations; this does not mean the Phase 8 PostgreSQL target is active. |
| Implement RLS and tenant boundaries | **Partial foundation / deferred runtime** | PostgreSQL foundation contains tenancy/RLS concepts, while current clinical runtime authorization is implemented at the Worker/application boundary. PostgreSQL RLS is not the active runtime authority. |
| Add identity provider integration | **Partial** | GitHub OAuth/runtime accounts/global patient identity exist for their respective surfaces; a final production identity-provider architecture across all actors is not complete. |
| Protect admin endpoints | **Partial — substantial Worker protection exists** | Worker admin/runtime routes have authentication/permission controls, but the broad Phase 8 target includes final production identity/role boundaries and the local-development-only NestJS surface is not a production authority. |
| Add append-only audit records | **Partial** | Audit/event records exist in parts of the Worker platform, but a complete independent append-only production audit store across all administrative/clinical publication actions is not established. |
| Add rule-bundle storage | **Planned / partial versioned-code authority** | Approved rule content is version-controlled in code/repository artifacts; no separate production rule-bundle persistence service is current authority. |
| Add atomic publication and rollback | **Partial** | Git publication provides versioned commits and rollback mechanics, but the proposed D1 catalogue authority + atomic export workflow is not implemented/approved. |
| Add decision record persistence | **Planned** | No source evidence justifies claiming a production DecisionRecord persistence authority. |

Phase 8 must not be interpreted as “move everything to PostgreSQL now.” The accepted current runtime is Cloudflare Worker/D1, and the catalogue ADR separately recommends D1 for catalogue editing unless the owner chooses PostgreSQL instead.

---

## Phase 9 — UI and brand redesign

| Roadmap item | Re-baselined status | Evidence / remaining boundary |
| --- | --- | --- |
| Apply the final GLYMIZE design system | **Partial** | Shared design-system/token work and CSS consolidation are implemented, but “final” requires product/design acceptance across all surfaces. |
| Add final logo and application icon | **Partial / likely near-complete asset implementation** | GLYMIZE logo/app-icon assets and PWA icons exist; final acceptance and removal/migration of all historical identifiers are still tied to Phase 1 rebranding. |
| Redesign welcome/dashboard experience | **Partial — substantial implementation exists** | Modern landing/dashboard/command-center work exists, but final product hierarchy depends on approved V1 scope. |
| Implement modern geometric English typography | **Partial** | Typography/design tokens exist; no formal final-design acceptance is recorded. |
| Implement compatible Persian typography | **Partial** | Persian/RTL typography is implemented across current surfaces; final acceptance remains open. |
| Review RTL/LTR behaviour | **Partial — substantial coverage exists** | Bilingual RTL/LTR behavior is implemented and has regression/screenshot work, but a final release-wide review is not recorded. |
| Review mirrored button and icon issues | **Partial** | UI/RTL work exists, but no complete release acceptance record is proven. |
| Improve clinical hierarchy and whitespace | **Partial** | Command-center, focused-workflow and layout-preset work materially improve hierarchy; final design acceptance remains open. |
| Review accessibility against WCAG 2.2 AA | **Planned / partial engineering practices only** | No formal WCAG 2.2 AA audit/acceptance evidence is established by this re-baseline. |

---

## Phase 10 — Validation and release readiness

| Roadmap item | Re-baselined status | Evidence / remaining boundary |
| --- | --- | --- |
| Clinical review of each rule | **Partial** | Many executable rules are explicitly evidence-bound and reviewed through PRs, but a formal complete clinician sign-off inventory for every active rule is not proven. |
| Usability testing with physicians | **Planned** | Automated UI tests do not substitute for structured physician usability testing. |
| Medication-catalogue verification for Iran | **Partial — strong pipeline evidence** | Three-source consensus/NFI/current-market tooling and verification metadata exist; final release-level catalogue verification/sign-off is not complete. |
| Insurance data verification | **Partial** | Insurance provenance and fail-closed claim-timing boundaries exist; release-grade payer verification remains incomplete. |
| Security review and threat model | **Partial / planned formal review** | Auth/RBAC/isolation hardening has been substantial, but no final whole-system release threat-model sign-off is proven. |
| Privacy and legal review | **Planned** | Requires formal product/legal review; cannot be satisfied by code tests. |
| Performance and offline testing | **Partial** | PWA/offline and automated validation infrastructure exist; formal release performance/offline acceptance remains open. |
| PWA update reliability testing | **Partial** | PWA version/update behavior exists; final release reliability campaign remains open. |
| Incident and rollback procedure | **Partial / planned release operations** | Git/versioned rollback mechanisms exist, but a complete incident runbook with operational rehearsal is not established. |
| Release checklist and clinical disclaimer review | **Partial / planned final acceptance** | Safety disclaimers exist; final release checklist and clinical/legal sign-off remain open. |

---

## Dependency-aware continuation order

The repository should not simply continue numerically through every open checkbox. The re-baselined dependency order is:

1. **Phase 1 owner product decision gate** — approve V1 scope, GLP-1/weight status, insulin-conversion priority, and release-visible Patient Care Hub scope. These decisions unblock contradictory copy/navigation cleanup and prevent removing working clinical capabilities by guesswork.
2. **Phase 2 formal safety-governance closure** — document system-wide precedence, explicitly bound or retire the legacy score compatibility path, and establish clinician-approved golden-case governance. Do not add new thresholds as part of this cleanup.
3. **Catalogue architecture owner decision** — confirm or reject `CATALOGUE_PERSISTENCE_DECISION.md` Option B (D1 editing/publishing authority with generated Git-JSON read artifact). Only then expand Phase 7 catalogue workflow/storage.
4. **Phase 6 shared ownership cleanup** — move remaining shared seeds out of `apps/api`, consolidate neutral shared packages and equivalence contracts without changing runtime authority.
5. **Phase 7/8 controlled platform hardening** — implement the chosen catalogue workflow/persistence and complete production governance boundaries. PostgreSQL remains deferred unless separately approved.
6. **Phase 9/10 release acceptance** — final brand/design/accessibility plus physician usability, complete clinical review, security/privacy/legal and operational release gates after product scope is stable.

## Immediate engineering task that does not require a product decision

While the Phase 1 product decision remains open, the first safe independent engineering task is:

> **Phase 2 closure audit — formalize the live clinical precedence model and retained legacy-score compatibility boundary without changing clinical behavior.**

Acceptance for that task:

- document the current precedence from structured patient facts → hard gate/exclusion → mandatory objectives → approved protocol/dose execution → composition/diversity → access/cost tie-breaks → display;
- enumerate every remaining consumer of the unconfigured legacy score builder before proposing deletion;
- add or strengthen a regression guard so the compatibility score path cannot regain physician-facing authority;
- identify which Phase 2 checklist items can then be closed versus which still require clinician-governed golden-case work;
- make no new clinical threshold, product eligibility, dose, evidence, ranking or deployment change.

This task can proceed independently while V1 scope awaits owner confirmation because it strengthens an already-live authority boundary without choosing product scope.

---

## Audit anchors

- Roadmap and completed Phase 3/4 trace: `docs/PROJECT_OVERVIEW_AND_ROADMAP.md`
- Factual repository snapshot: `docs/CURRENT_STATE.md`
- Runtime authority: `docs/architecture/RUNTIME_OF_RECORD.md`
- Live Type 2 authority: `docs/architecture/CLINICAL_ENGINE_AUTHORITY.md`
- Catalogue persistence proposal awaiting owner decision: `docs/architecture/CATALOGUE_PERSISTENCE_DECISION.md`
- Type 2 input contract/coverage: `packages/clinical-engine/src/type2-input-contract-v2/*`, `apps/web/app/type-2/type2-input-coverage-v2.ts`
- Insulin conversion engine/UI/tests: `packages/clinical-engine/src/insulin-conversion.ts`, `apps/web/app/insulin-tools/insulin-tools-client.tsx`, `packages/clinical-engine/test/insulin-conversion.test.ts`
- Worker platform/config/migrations: `apps/admin-worker/src/platform-v3.ts`, `apps/admin-worker/wrangler.jsonc`, `apps/admin-worker/migrations/*`

## Audit integrity statement

This re-baseline intentionally leaves broad roadmap checkboxes open when evidence is only partial. It does not convert implemented-but-disabled features into deployed claims, does not convert automated tests into clinical validation, and does not treat architecture foundations as active production authorities.