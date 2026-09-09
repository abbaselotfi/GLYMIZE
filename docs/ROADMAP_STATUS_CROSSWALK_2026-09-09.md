# GLYMIZE Roadmap Status Crosswalk — 2026-09-09

**Status:** current execution control for canonical Roadmap §28

**Repository baseline:** `main@37f6bbf1d5c89878e871587253e75713a7973ffa`

**Canonical direction:** [`ROADMAP.md`](ROADMAP.md)

**Runtime authorities:** [`RUNTIME_OF_RECORD.md`](architecture/RUNTIME_OF_RECORD.md) and [`CLINICAL_ENGINE_AUTHORITY.md`](architecture/CLINICAL_ENGINE_AUTHORITY.md)

This crosswalk prevents completed foundations from being rebuilt under a second task name. It records repository evidence separately from remaining engineering, physician evaluation, and environment activation. It changes no clinical rule, feature flag, migration, access grant, or remote environment.

For the private initial build, physician sign-off is not a prerequisite for continuing implementation. Physician usability and clinical review evidence remain separate release/pilot records under R28-09. The owner also acts as the application administrator and controls physician/assistant access; repository presence alone is not evidence that an uninspected remote environment is active.

## Canonical task crosswalk

| Canonical phase/task | Status at baseline | Existing source / merge evidence | Exact remaining gap | Acceptance evidence for remaining work | Dependency |
| --- | --- | --- | --- | --- | --- |
| A / R28-01 status reconciliation | **Complete** | Roadmap §28, this document, `CURRENT_STATE.md`, commit `0d799f93a5a671df5c6ff26627d056a743571a13` | Keep this table current as later R28 tasks land | Source links, task-specific tests, and the final commit SHA recorded per completed task | none |
| B1 Patient Clinical Core architecture inventory | **Implemented foundation** | [`PATIENT_CLINICAL_CORE_README.md`](architecture/PATIENT_CLINICAL_CORE_README.md), inventory, gap matrix and migration ADR; PR [#130](https://github.com/abbaselotfi/GLYMIZE/pull/130) | No repeat inventory. Reconcile older B1 wording with later B2/B3/C1 implementation during factual documentation sync | Existing B1 checklist remains historical evidence; accepted Worker/D1 authority and no-second-store ADR remain unchanged | complete |
| B2 Canonical Clinical Fact / Context contracts | **Implemented foundation; authority coverage partial** | `packages/contracts/src/patient-core/`; PR [#131](https://github.com/abbaselotfi/GLYMIZE/pull/131) | Make reader completeness executable and close authoritative allergy/problem/medication/context gaps without a second store | R28-03 controlled reader/route tests and R28-06 state/provenance tests | B1; then R28-03/R28-06 |
| B3 Longitudinal read model + change detection | **Implemented foundation; partial families** | `apps/admin-worker/src/patient-core/`; PR [#132](https://github.com/abbaselotfi/GLYMIZE/pull/132) | Preserve partial/unknown semantics, bound reads, expose truncation/cost, and prevent false removals | R28-03 executable completeness matrix and R28-05 bounded-query/performance evidence | B2; then R28-03/R28-05 |
| C1 Visual Patient Workspace | **Implemented foundation; R28-02 hardening complete; acceptance still incomplete** | `/patients/[patientId]`, `patient-clinical-brief.ts`, C1 completion surfaces; PRs [#133](https://github.com/abbaselotfi/GLYMIZE/pull/133) and [#134](https://github.com/abbaselotfi/GLYMIZE/pull/134); R28-02 commit `37f6bbf1d5c89878e871587253e75713a7973ffa`; [completion record](R28_02_PATIENT_WORKSPACE_ASYNC_BINDING_2026-09-09.md) | Align brief/source drill-down and bound large records; module and AI handoff remain separate tasks | R28-02 race/scope/malformed-response acceptance is complete; R28-04 source-navigation tests, R28-05 large-record evidence, R28-09 observed usability remain | B3; R28-02 complete; then R28-04/R28-05 |
| C2 Touch/pen component standard | **Partial patterns; no canonical standard** | Responsive bilingual UI and C1 styles/components | Establish reusable interaction and accessibility acceptance only when touched by R28-04 and later workflow work | Touch, keyboard, RTL/LTR and WCAG-focused checks; physician observation belongs to R28-09 | C1 |
| D1 Medication Intelligence gap audit | **Partial assets; audit/convergence open** | Existing catalogue, safety registries, dose, cost and insurance assets; Patient Core medication projection | Complete R28-06 authority/state audit and adapters before shared eligibility consumes Patient Core facts | Distinguish missing/absent/unverified/stale/current and pre-visit states; prove missing facts never imply clearance | R28-03 |
| E1 Evidence/AI generalization audit | **Partial assets; patient-aware connection open** | Evidence Assistant, provider abstraction, versioned AI configuration; C1 drawer sends no patient data | Complete constrained Patient Context boundary and server-side revalidation in R28-08 | Scope-revocation, source/citation, contamination, provider-failure and context-switch tests | R28-02 complete; then R28-03/R28-06 |
| F1 Clinical Module contract | **Target described; registry/handoff open** | Inventory §13/§17 and local C1 launcher | Define typed registry, canonical maturity mapping and reviewed Patient Core-to-module adapter in R28-07 | Identity/revision/required-input checks, Type 2 equivalence and one second read-only registration | R28-02 complete; then R28-06 |
| G Diabetes reference-module integration | **Existing Type 2 authority; shared-module handoff open** | `/type-2`, Decision Graph v2 and Clinical Engine Authority | Integrate through F1/R28-07 without changing existing clinical authority or compatibility routes | Type 2 equivalence plus context handoff tests | R28-07 |
| H / R28-09 clinic-ready acceptance | **Evidence collection planned** | Existing CI, stress suites and historical RC records | Bind one reviewed candidate SHA, active capability state, recovery evidence and measured physician workflows | Single acceptance packet described by R28-09 | affected R28 tasks |

## Required four-way status for implemented foundations

| Task | Implemented foundation | Remaining engineering | Physician review | Environment activation |
| --- | --- | --- | --- | --- |
| B1 | Inventory, gap matrix and incremental migration ADR merged in PR #130 | Factual wording sync only; do not rerun inventory | Not applicable to an architecture inventory; later clinical/usability review is tracked where behavior is evaluated | No runtime capability is created by B1 |
| B2 | Versioned Patient Core fact, provenance, collection, context and longitudinal contracts merged in PR #131 | Reader authority/completeness and shared safety-facing families remain R28-03/R28-06 | Not a prerequisite for continuing the private initial build; review any future clinical policy/freshness semantics where introduced | Contracts are code dependencies, not independently activated features |
| B3 | Worker/D1-backed longitudinal projection and deterministic change model merged in PR #132 | Partial families, exclusion semantics and bounded reads remain R28-03/R28-05 | Usability/clinical interpretation evidence is collected with the exact candidate in R28-09 | Route presence on `main` is proven; no uninspected remote activation is claimed |
| C1 | Ten-second brief and completion surfaces merged in PRs #133/#134; active-context async binding completed in R28-02 at `37f6bbf1d5c89878e871587253e75713a7973ffa` | R28-04/R28-05 remain; patient-aware module/AI handoff belongs to R28-07/R28-08 | Not a blocker for implementation; observed physician workflow evidence remains an R28-09 acceptance artifact | Surface exists in the repository; access and environment capability are controlled by the owner/admin and must be recorded per environment |

## R28 execution progress

- **R28-01 — Complete.** Status reconciliation landed at `0d799f93a5a671df5c6ff26627d056a743571a13` and established this crosswalk as the execution control.
- **R28-02 — Complete.** Patient Workspace async reads are now bound to the active actor/practice/patient context. Obsolete reads are aborted/ignored; post-response context is revalidated; inaccessible/changed auth context clears the prior model; longitudinal response version, patient/practice scope, nested facts, timeline events and change objects are validated before render. Final implementation commit: `37f6bbf1d5c89878e871587253e75713a7973ffa`. Validation evidence is recorded in [`R28_02_PATIENT_WORKSPACE_ASYNC_BINDING_2026-09-09.md`](R28_02_PATIENT_WORKSPACE_ASYNC_BINDING_2026-09-09.md).
- **Next:** R28-03 — Make read-model completeness an executable contract. R28-04/R28-05/R28-06 follow as ordered by canonical Roadmap §28.4.

## Identifier mapping — one task, one name

The B1 inventory used local continuation labels before the canonical phase names were fixed. They are aliases, not extra work:

| Local B-series label | Canonical task | R28 execution task |
| --- | --- | --- |
| B4 — Medication Intelligence convergence | D1 — Medication Intelligence gap audit | R28-06 |
| B5 — AI Patient Context / Copilot contract | E1 — Evidence/AI generalization audit | R28-08 |
| B6 — Clinical Module framework and registry | F1 — Clinical Module contract | R28-07 |
| B7 — Diabetes module convergence | G — reference-module integration | R28-07 after F1 |
| B8 — second specialty proof | G/later specialty onboarding | Demonstrate only a read-only registration in R28-07; treatment support is separate future work |

Future commits and documents should use the canonical D1/E1/F1/G names, with the old B4–B8 labels shown only as aliases when linking historical B1 material.

## Documentation drift queued for factual sync

The following documents are retained as historical baselines but contain statements that predate merged B2/B3/C1 work:

- `architecture/PATIENT_CLINICAL_CORE_README.md` still says B2 is next;
- `architecture/PATIENT_CLINICAL_CORE_GAP_MATRIX.md` records several B2/B3 gaps in their pre-implementation form;
- `architecture/PATIENT_CLINICAL_CORE_INVENTORY.md` labels candidate B2 contracts as not implemented;
- `CURRENT_STATE.md` previously stopped before PRs #130–#134 and is now synchronized through R28-02.

Update these descriptions only as factual status sync. Preserve their historical baselines and accepted runtime boundaries; do not rewrite applied migrations, infer remote deployment, or close R28 acceptance work from file existence.
