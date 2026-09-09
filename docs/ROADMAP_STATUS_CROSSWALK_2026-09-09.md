# GLYMIZE Roadmap Status Crosswalk — 2026-09-09

**Status:** current execution control for canonical Roadmap §28

**Repository baseline:** R28-05 implementation is validated at `main@a3076171690f5cd80d3c89ba55ded5fba4b67faf`; completion evidence is recorded in [`R28_05_BOUNDED_LONGITUDINAL_READS_2026-09-09.md`](R28_05_BOUNDED_LONGITUDINAL_READS_2026-09-09.md).

**Canonical direction:** [`ROADMAP.md`](ROADMAP.md)

**Runtime authorities:** [`RUNTIME_OF_RECORD.md`](architecture/RUNTIME_OF_RECORD.md) and [`CLINICAL_ENGINE_AUTHORITY.md`](architecture/CLINICAL_ENGINE_AUTHORITY.md)

This crosswalk prevents completed foundations from being rebuilt under a second task name. It records repository evidence separately from remaining engineering, physician evaluation, and environment activation. It changes no clinical rule, feature flag, migration, access grant, or remote environment.

For the private initial build, physician sign-off is not a prerequisite for continuing implementation. Physician usability and clinical review evidence remain separate release/pilot records under R28-09. The owner also acts as the application administrator and controls physician/assistant access; repository presence alone is not evidence that an uninspected remote environment is active.

## Canonical task crosswalk

| Canonical phase/task | Status at baseline | Existing source / merge evidence | Exact remaining gap | Acceptance evidence for remaining work | Dependency |
| --- | --- | --- | --- | --- | --- |
| A / R28-01 status reconciliation | **Complete** | Roadmap §28, this document, `CURRENT_STATE.md`, commit `0d799f93a5a671df5c6ff26627d056a743571a13` | Keep this table current as later R28 tasks land | Source links, task-specific tests, and the final commit SHA recorded per completed task | none |
| B1 Patient Clinical Core architecture inventory | **Implemented foundation** | [`PATIENT_CLINICAL_CORE_README.md`](architecture/PATIENT_CLINICAL_CORE_README.md), inventory, gap matrix and migration ADR; PR [#130](https://github.com/abbaselotfi/GLYMIZE/pull/130) | No repeat inventory. Reconcile older B1 wording with later B2/B3/C1 implementation during factual documentation sync | Existing B1 checklist remains historical evidence; accepted Worker/D1 authority and no-second-store ADR remain unchanged | complete |
| B2 Canonical Clinical Fact / Context contracts | **Implemented foundation; executable collection completeness landed; authority coverage partial** | `packages/contracts/src/patient-core/`; PR [#131](https://github.com/abbaselotfi/GLYMIZE/pull/131); R28-03 commit `8419ffa6b11698f81c36ba785226239895c301b0` | Close authoritative allergy/problem/medication/context gaps without a second store | R28-03 completeness acceptance is complete; R28-06 state/provenance evidence remains | B1; R28-03 complete; then R28-06 |
| B3 Longitudinal read model + change detection | **Implemented foundation; completeness/source presentation and bounded history hardened** | `apps/admin-worker/src/patient-core/`; PR [#132](https://github.com/abbaselotfi/GLYMIZE/pull/132); [R28-03](R28_03_READ_MODEL_COMPLETENESS_2026-09-09.md), [R28-04](R28_04_PATIENT_WORKSPACE_CURRENT_FINDINGS_2026-09-09.md), and [R28-05](R28_05_BOUNDED_LONGITUDINAL_READS_2026-09-09.md) completion records | Shared safety-facing authority/state convergence remains R28-06; broader longitudinal families remain explicitly partial until separately implemented | R28-03 completeness, R28-04 current/source alignment, and R28-05 bounded-query/continuation/performance evidence are complete | B2; R28-03/R28-04/R28-05 complete; then R28-06 |
| C1 Visual Patient Workspace | **Implemented foundation; R28-02/R28-04/R28-05 hardening complete; usability acceptance remains** | `/patients/[patientId]`, shared selection/source/history modules, C1 completion surfaces; PRs [#133](https://github.com/abbaselotfi/GLYMIZE/pull/133), [#134](https://github.com/abbaselotfi/GLYMIZE/pull/134), and R28-05 validation PR #135; R28-02 commit `37f6bbf1d5c89878e871587253e75713a7973ffa`; R28-04 baseline `c9afbed2b8fbecbc8255548156a4aa96b04449a3`; R28-05 `a3076171690f5cd80d3c89ba55ded5fba4b67faf` | Patient-aware module and AI handoff remain R28-07/R28-08; observed usability remains R28-09 | Active-context, source/current alignment, preview overflow and bounded-history acceptance are complete; R28-09 observed workflow evidence remains | B3; R28-02/R28-03/R28-04/R28-05 complete |
| C2 Touch/pen component standard | **Partial patterns; no canonical standard** | Responsive bilingual UI and C1 styles/components | Establish reusable interaction and accessibility acceptance when touched by later workflow work | Touch, keyboard, RTL/LTR and WCAG-focused checks; physician observation belongs to R28-09 | C1 |
| D1 Medication Intelligence gap audit | **Partial assets; R28-06 authority/state convergence next** | Existing catalogue, safety registries, dose, cost and insurance assets; Patient Core medication projection | Complete R28-06 authority/state audit and adapters before shared eligibility consumes Patient Core facts | Distinguish missing/absent/unverified/stale/current and pre-visit states; prove missing facts never imply clearance | R28-03 complete; R28-06 next |
| E1 Evidence/AI generalization audit | **Partial assets; patient-aware connection open** | Evidence Assistant, provider abstraction, versioned AI configuration; C1 drawer sends no patient data | Complete constrained Patient Context boundary and server-side revalidation in R28-08 | Scope-revocation, source/citation, contamination, provider-failure and context-switch tests | R28-02/R28-03 complete; then R28-06 |
| F1 Clinical Module contract | **Target described; registry/handoff open** | Inventory §13/§17 and local C1 launcher | Define typed registry, canonical maturity mapping and reviewed Patient Core-to-module adapter in R28-07 | Identity/revision/required-input checks, Type 2 equivalence and one second read-only registration | R28-02 complete; then R28-06 |
| G Diabetes reference-module integration | **Existing Type 2 authority; shared-module handoff open** | `/type-2`, Decision Graph v2 and Clinical Engine Authority | Integrate through F1/R28-07 without changing existing clinical authority or compatibility routes | Type 2 equivalence plus context handoff tests | R28-07 |
| H / R28-09 clinic-ready acceptance | **Evidence collection planned** | Existing CI, stress suites, R28-05 large-record performance evidence and historical RC records | Bind one reviewed candidate SHA, active capability state, recovery evidence and measured physician workflows | Single acceptance packet described by R28-09 | affected R28 tasks |

## Required four-way status for implemented foundations

| Task | Implemented foundation | Remaining engineering | Physician review | Environment activation |
| --- | --- | --- | --- | --- |
| B1 | Inventory, gap matrix and incremental migration ADR merged in PR #130 | Factual wording sync only; do not rerun inventory | Not applicable to an architecture inventory; later clinical/usability review is tracked where behavior is evaluated | No runtime capability is created by B1 |
| B2 | Versioned Patient Core fact, provenance, collection, context and longitudinal contracts merged in PR #131; R28-03 adds executable projection diagnostics/accounting | Shared safety-facing authority families remain R28-06 | Not a prerequisite for continuing the private initial build; review future clinical policy/freshness semantics where introduced | Contracts are code dependencies, not independently activated features |
| B3 | Worker/D1-backed longitudinal projection and deterministic change model merged in PR #132; R28-03 defines the eligible observation universe; R28-04 exposes current-vs-historical selection/revision provenance; R28-05 adds bounded continuation and measured synthetic cost | Safety-facing Patient Core authority/state convergence remains R28-06; unexposed event families remain explicitly partial | Usability/clinical interpretation evidence is collected with the exact candidate in R28-09 | Route presence on `main` is proven; no uninspected remote activation is claimed |
| C1 | Ten-second brief/completion surfaces merged in PRs #133/#134; active-context binding completed in R28-02; current/source alignment in R28-04; bounded load-more history in R28-05 | Patient-aware module/AI handoff belongs to R28-07/R28-08 | Not a blocker for implementation; observed physician workflow evidence remains an R28-09 acceptance artifact | Surface exists in the repository; access and environment capability are controlled by the owner/admin and must be recorded per environment |

## R28 execution progress

- **R28-01 — Complete.** Status reconciliation landed at `0d799f93a5a671df5c6ff26627d056a743571a13` and established this crosswalk as the execution control.
- **R28-02 — Complete.** Patient Workspace async reads are bound to the active actor/practice/patient context. Final implementation commit: `37f6bbf1d5c89878e871587253e75713a7973ffa`. Validation evidence is recorded in [`R28_02_PATIENT_WORKSPACE_ASYNC_BINDING_2026-09-09.md`](R28_02_PATIENT_WORKSPACE_ASYNC_BINDING_2026-09-09.md).
- **R28-03 — Complete.** The longitudinal observation reader declares `latest_snapshot_revision_per_encounter` as its source universe, accounts rejected/raw rows as intentional exclusions, converts skipped eligible invalid facts to `partial`, retains decryption failure as a hard error, and exposes audited projection counts. Final implementation commit: `8419ffa6b11698f81c36ba785226239895c301b0`. Validation evidence is recorded in [`R28_03_READ_MODEL_COMPLETENESS_2026-09-09.md`](R28_03_READ_MODEL_COMPLETENESS_2026-09-09.md).
- **R28-04 — Complete.** Brief, Attention Now and current previews share a newest-per-exact-series selection contract; historical flags remain separate, current unverified findings stay explicit, incompatible unit/specimen series do not collapse, preview overflow is expandable, and consequential facts expose Source/Audit provenance including immutable observation revision. Final implementation/test baseline: `c9afbed2b8fbecbc8255548156a4aa96b04449a3`. Direct-main validation run `34335565064` passed. Evidence is recorded in [`R28_04_PATIENT_WORKSPACE_CURRENT_FINDINGS_2026-09-09.md`](R28_04_PATIENT_WORKSPACE_CURRENT_FINDINGS_2026-09-09.md).
- **R28-05 — Complete.** Initial longitudinal observations/timeline are bounded and continuable under an HMAC-signed practice/patient/family/sourceVersion cursor. Truncation cannot imply complete history; mixed-source continuation is tested for no duplicates/omissions; synthetic small/medium/large cohorts demonstrate bounded initial rows/query count/decryption count/payload as history grows. Implementation commit: `a3076171690f5cd80d3c89ba55ded5fba4b67faf`. PR validation `34351829348`, direct-main validation `34352391023`, and Codebase Memory run `34352390942` passed. Evidence is recorded in [`R28_05_BOUNDED_LONGITUDINAL_READS_2026-09-09.md`](R28_05_BOUNDED_LONGITUDINAL_READS_2026-09-09.md).
- **Next: R28-06.** Audit/adapt existing Patient Core medication/context sources and preserve missing/unverified/freshness/reconciliation semantics. No new allergy/problem/context write authority may be introduced without the separate review/ADR required by Roadmap §28.

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
- `architecture/PATIENT_CLINICAL_CORE_GAP_MATRIX.md` records several B2/B3 gaps in their pre-implementation form and is the R28-06 audit target;
- `architecture/PATIENT_CLINICAL_CORE_INVENTORY.md` labels candidate B2 contracts as not implemented;
- `CURRENT_STATE.md` is synchronized through R28-05 after the associated closure update.

Update these descriptions only as factual status sync. Preserve their historical baselines and accepted runtime boundaries; do not rewrite applied migrations, infer remote deployment, or close R28 acceptance work from file existence.