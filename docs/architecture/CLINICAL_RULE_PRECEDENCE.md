# GLYMIZE Clinical Rule Precedence

- Status: **Accepted implementation record for live Type 2**
- Date: 2026-09-08
- Repository baseline: `main@06d4873469767cee0bf2a5ca3053005ddb666a7b`
- Roadmap reference: Phase 2 clinical-logic safety foundation
- Scope: document the precedence already implemented by the physician-facing Type 2 Decision Graph and bound the retained legacy-score compatibility path. This document does not add or change a clinical threshold, dose, indication, evidence source, ranking rule, feature flag, migration, or deployment.

## 1. Authority statement

The configured physician-facing Type 2 pathway is governed by `decision-graph-v2`. It is explicitly non-score-based and reports:

- `scoreBased: false`;
- `selectionMethod: hard_gates_then_pareto_then_lexicographic`.

The older aggregate-score builder in `packages/clinical-engine/src/index.ts` is not the configured physician-facing authority. It remains only for explicitly unconfigured compatibility behavior, administrative preview surfaces, local-development compatibility, and tests that preserve or adversarially exercise that boundary.

## 2. Live Type 2 precedence

The current executable precedence is the following ordered chain.

### 2.1 Structured patient facts and provenance first

The request is normalized into structured patient context before treatment selection. Missing facts remain missing unless an explicit, reviewed deterministic derivation exists. UI presence, a broad domain checkbox, a medication name, or an unanswered safety field cannot invent a diagnosis or safety clearance.

The active Type 2 input contract and UI coverage map remain the audit surface for which facts are collected, derived, unavailable, or intentionally not collected.

### 2.2 Clinical-state classification and adaptive-data requirements

`classifyClinicalStateV2()` determines the pathway state from represented patient facts and versioned policy. `resolveAdaptiveDataRequirementsV2()` then identifies required missing data. Items marked `blocksFinalDecision` prevent a complete final decision rather than being guessed.

Urgent states such as represented DKA/HHS/positive ketones or severe hyperglycemia with catabolic features can elevate the overall result to urgent clinician review independently of ordinary medication preference ranking.

### 2.3 Clinical objectives before preferences

`resolveClinicalObjectivesV2()` resolves mandatory and preference-level objectives from the classified state. Mandatory objectives establish clinical requirements that later cost, insurance, convenience, or display logic cannot erase.

### 2.4 Candidate generation is bounded

`generateRegimenCandidatesV2()` generates only supported regimen structures. It does not provide an unrestricted free-form combinatorial prescribing surface.

### 2.5 Hard gates are structural exclusions

`applyHardGatesV2()` runs before a candidate can participate in primary executable selection. Candidates with gate status `exclude`, `needs_data`, or `historical_only` are separated from the top-eligible pool. Only `gate.status === "pass"` enters the primary executable pool.

A downstream preference, price, insurance result, or display score therefore cannot re-promote a hard-excluded candidate into the live primary/alternative set.

The retained unconfigured legacy fallback has a separate `filterHardExcludedLegacyType2Assessment()` firewall for the same safety reason: legacy score arithmetic is never sufficient authority to keep a true hard contraindication in returned ranked compatibility choices.

### 2.6 Reviewed dose/product/market/access enrichment cannot create clinical eligibility

After hard gating, `enrichCandidateWithDoseMarketCostV2()` binds reviewed dose/product and current-market/access information. Missing exact execution prerequisites remain fail-closed. Market presence, insurance, or price cannot convert an otherwise clinically ineligible candidate into an executable one.

Product-specific execution, such as reviewed WEGOVY MASH safety, requires exact current product identity and the current complete reviewed safety review set. Merely carrying a safety envelope is not global product clearance.

### 2.7 Pareto pruning precedes lexicographic selection

For the eligible glycemic pool, `paretoPruneV2()` removes dominated options against the resolved objectives. `selectLexicographicallyV2()` then applies ordered policy constraints and preferences. The live path does not collapse safety, efficacy, access, cost, and preference into one aggregate numeric score.

Cost/access may resolve a choice only within the ordered policy boundary after clinical requirements have been preserved. A clinically mandatory insulin recommendation may remain visible when `insured_only` cannot prove coverage; in that case access is unresolved rather than clinical necessity being erased.

### 2.8 Composition preserves mandatory objectives and structural conflicts

`composeTreatmentPlanV2()` combines the selected glycemic regimen with supporting executable candidates while enforcing component/therapy-group compatibility and mandatory objectives. Unresolved mandatory objectives produce an explicit incomplete/no-fully-eligible outcome rather than a fabricated complete plan.

### 2.9 Diversity is downstream of authority

Alternatives are selected only after the primary eligible ordering is established. `chooseDiverseAlternatives()` prevents duplicate scenario cards on clinically meaningful diversity axes; it never makes a hard-excluded candidate eligible.

### 2.10 Presentation is last and non-authoritative

`toRecommendationV2()` and the compatibility/UI projection present the already-selected result. Graph-derived compatibility rows deliberately carry `priorityScore: 0`; graph rank and composed-plan authority are preserved separately.

`scenario-engine-safe.ts` detects Decision Graph-derived assessments and preserves graph ordering instead of applying the older aggregate-score scenario ordering.

Parallel safety/referral and investigation-recommendation channels are additive and explicitly non-ranking. They cannot change medication graph rank, dose execution, scenario ordering, or create physician-authored orders.

## 3. Retained legacy-score compatibility inventory

The 2026-09-08 repository audit found the following direct uses of the older score builder.

### 3.1 Runtime compatibility fallback

`packages/clinical-engine/src/type2-decision-graph-runtime.ts` imports the old root `buildType2Assessment` as `buildLegacyType2Assessment`. It is called only when the Decision Graph runtime catalogue has not been configured (`!runtimeCatalog?.masterRegistry.length`). The result is passed through `filterHardExcludedLegacyType2Assessment()` before it is returned.

This is a compatibility fallback, not a second configured physician authority.

### 3.2 Browser administrative preview

`apps/web/lib/api-client.ts` calls `buildType2MedicationConsiderations()` directly only for:

`GET /v1/admin/preview/type-2-considerations`

The physician-facing:

`POST /v1/catalog/type-2/considerations`

calls the configured `type2Assessment()` boundary instead.

### 3.3 Local-development NestJS preview

`apps/api/src/catalog/catalog.service.ts` uses `buildType2Assessment()` for `listType2MedicationConsiderations()`. The direct legacy `buildType2MedicationConsiderations()` call is isolated to `listType2PreviewConsiderations()`.

`apps/api` remains local-development-only compatibility code under the accepted Runtime of Record.

### 3.4 Tests

Direct test consumers intentionally exercise presentation compatibility, guideline-evidence compatibility, clinical-context compatibility, hard-exclusion behavior, randomized safety, and stress invariants. These tests are evidence for the retained boundary; they do not make the old builder physician-facing authority.

### 3.5 Private score function

`scoreMedication()` is private to `packages/clinical-engine/src/index.ts`. The audit found no external production import of that function. Its result feeds only the retained legacy builder's `priorityScore` ordering.

## 4. Regression invariant

The repository must fail validation if any of these boundaries regress:

1. configured Type 2 assessment stops carrying Decision Graph authority;
2. graph-derived medication rows regain a meaningful aggregate `priorityScore`;
3. graph-derived scenarios are sent through legacy aggregate-score ordering;
4. the browser physician POST route calls the direct legacy medication builder;
5. the local-development main Type 2 assessment method calls the direct legacy medication builder;
6. the direct legacy builder escapes its explicit admin/local preview or unconfigured compatibility boundaries without a separately reviewed authority decision.

## 5. Phase 2 status after this record

This record is sufficient to close the narrow roadmap item **Define rule precedence** for the live Type 2 pathway because precedence and the compatibility exception are now explicit and regression-guarded.

The following broader Phase 2 items remain open or partial:

- **Separate hard blocks, cautions, preferences, cost, and display:** strongly implemented and now documented for live Type 2, but the roadmap item spans retained compatibility and other clinical modules.
- **Replace unexplained score constants:** incomplete repository-wide because the unconfigured legacy compatibility builder still contains aggregate score constants.
- **Create traceable rule metadata:** substantial versioned rule/evidence infrastructure exists, but universal coverage across every future rule family is not yet proven.
- **Define minimum safe inputs per pathway:** Type 2 has machine-readable capability/input contracts, but not every clinical module has the same completeness contract. `cardiovascular.nyha_class` remains intentionally uncollected until a real consumer exists.
- **Add source versioning and review fields:** substantial coverage exists, but universal schema coverage is not yet proven.
- **Add clinical golden cases:** deterministic and stress suites are extensive, but clinician-reviewed/sign-off golden-case governance is a separate release-governance requirement.

## 6. Deletion boundary for the legacy builder

Do not delete `buildType2MedicationConsiderations()` or the legacy root assessment merely because they are no longer configured physician authority. Removal requires a separate task that first migrates or retires:

- the browser admin preview;
- the local-development NestJS preview;
- explicit unconfigured compatibility consumers;
- tests whose purpose is to preserve legacy/adversarial compatibility behavior.

Until then, the correct safety posture is **bounded, explicit, structurally firewalled compatibility**, not silent deletion or renewed clinical authority.
