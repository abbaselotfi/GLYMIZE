# Clinical Engine Authority

- Status: **Accepted** (documentation-only; this task changes no runtime behavior)
- Date: 2026-09-04
- Roadmap reference: Phase 3 / Task 1 and §8.27 (first step; convergence itself is Phase 3 / Task 2)
- Scope: record which clinical engine actually serves the live `/type-2` route today, and which engine the 275,000-case stress campaign validates. No code path is changed by this decision.

## 1. The live `/type-2` call path (traced)

| Step | Location | What happens |
| --- | --- | --- |
| 1 | `apps/web/app/type-2/page.tsx` | Renders `Type2ExperienceFrame` |
| 2 | `apps/web/app/type-2/type2-experience-frame.tsx:108` | Renders `Type2ScenariosClient` — the only live assessment client |
| 3 | `apps/web/app/type-2/type2-scenarios-client.tsx:414` | `apiFetch("/v1/catalog/type-2/considerations", ...)` — a browser-owned route per [Runtime of Record](RUNTIME_OF_RECORD.md); the request never leaves the browser bundle |
| 4 | `apps/web/lib/api-client.ts:531` | Calls `buildType2Assessment(visibleCatalogue, request)` from `@glymize/clinical-engine` |
| 5 | `packages/clinical-engine/src/index.ts:389-398` | `buildType2Assessment` = `buildType2PathwayRecommendation` + `buildType2MedicationConsiderations` |

**Authority statement:** the engine that serves the live physician-facing `/type-2`
route today is the **legacy rule-pack-driven considerations path** in
`packages/clinical-engine/src/index.ts` (`buildType2Assessment` and the two
functions it composes). `decision-graph-v2` is **not** in the live path; the
package root only re-exports it (`src/index.ts:537`).

## 2. What the 275,000-case campaign validates

`packages/clinical-engine/test/stress-campaign-v4.test.ts` runs both entry
points under the same safety invariants:

| Suite | Cases | Engine exercised |
| --- | ---: | --- |
| Heterogeneous clinical scenarios (invariant aggregation) | 100,000 | Both: the live legacy path (`buildType2PathwayRecommendation`, `buildType2MedicationConsiderations` — lines 312-316) **and** `runDecisionGraphV2` (line 410), each with its own invariant family (`LEGACY_*`, `GRAPH_*`) |
| Financial scenarios incl. malformed insurer data | 100,000 | `calculateProductMonthlyCostV2` (decision-graph-v2) |
| Metamorphic | 50,000 | decision-graph-v2 |
| Adversarial numeric | 25,000 | decision-graph-v2 |

**Authority statement:** decision-graph-v2 is the predicate/gate/objective/
Pareto/policy/composition engine validated by the campaign, and the campaign
also keeps the live legacy path's clinical invariants green at the same scale.

## 3. Known non-live consumers

- `apps/web/app/type-2/type2-v2-client.tsx` — also posts to the same browser route (`:554`) but is **imported by no page/component**; it is not part of the live path.
- `apps/api/src/catalog/catalog.service.ts:49` — calls `buildType2Assessment`, but `apps/api` is local-development-only per [Runtime of Record](RUNTIME_OF_RECORD.md) and is not a production surface.

## 4. Gap and next step (Phase 3 / Task 2)

The live physician-facing ranking/considerations output is produced by the
legacy path, while the structurally validated engine (gates, objectives,
Pareto, policy, composition) is `decision-graph-v2`. Converging the live path
onto `decision-graph-v2/engine.ts` — leaving at most a behavior-tested adapter
for the legacy entry point and adding an integration guard against a second
independent Type 2 scoring path — is exactly Phase 3 / Task 2 and is
deliberately **not** done here.

## 5. What this decision does not do

- No runtime change, no engine switch, no output change.
- No rule-pack, threshold, citation, or rule-activation change (guardrails hold).
- No change to the 275,000-case campaign; it remains green as-is.

## 6. Verification anchors

| Fact | Anchor |
| --- | --- |
| Live page chain | `apps/web/app/type-2/page.tsx` → `type2-experience-frame.tsx:108` |
| Live submission | `type2-scenarios-client.tsx:414` |
| Live engine entry | `apps/web/lib/api-client.ts:531` → `packages/clinical-engine/src/index.ts:389` |
| Legacy implementation | `buildType2MedicationConsiderations` (`src/index.ts:404`) using `getActiveClinicalRulePack()` |
| decision-graph-v2 re-export (not live) | `src/index.ts:537` |
| Campaign | `packages/clinical-engine/test/stress-campaign-v4.test.ts` (100k + 100k + 50k + 25k) |
| Non-live client | `apps/web/app/type-2/type2-v2-client.tsx` (unreferenced) |
