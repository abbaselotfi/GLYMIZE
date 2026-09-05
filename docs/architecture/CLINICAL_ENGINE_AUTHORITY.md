# Clinical Engine Authority

- Status: **Accepted — live convergence implemented in Phase 3 / Task 2**
- Date: 2026-09-05
- Roadmap reference: Phase 3 / Tasks 1–2 and §8.27
- Scope: record the physician-facing Type 2 authority after convergence and the compatibility boundary that remains for non-live consumers.

## 1. Live `/type-2` authority after convergence

The physician-facing browser route remains:

`apps/web/app/type-2/page.tsx`
→ `type2-experience-frame.tsx`
→ `type2-scenarios-client.tsx`
→ browser-owned `/v1/catalog/type-2/considerations`
→ `apps/web/lib/api-client.ts`
→ root `@glymize/clinical-engine` `buildType2Assessment`.

The package root now resolves through `src/index-runtime.ts` and
`src/type2-decision-graph-runtime.ts`. Once the browser catalogue store has
loaded the published approved WorldDrug master registry and the current Iran
clinician-market snapshot, `buildType2Assessment` calls
`buildType2AssessmentFromDecisionGraphV2`, which builds the Decision Graph
inventory and invokes `runDecisionGraphV2` in
`decision-graph-v2/engine.ts`.

**Authority statement:** `decision-graph-v2` is now the single live clinical
selection/ranking authority for physician-facing Type 2 recommendations.

## 2. Browser catalogue and market configuration

`apps/web/lib/catalog/browser-catalog-state.ts` awaits both the existing
clinician-market loader and `loadType2DecisionGraphMarketProducts()` before
serving browser-owned catalogue routes. The selected published/local catalogue
state supplies `masterRegistry`; the market adapter supplies verified NFI
products, price evidence, and eligible insurance evidence. The runtime is
configured only when an approved master-registry snapshot and market products
are available.

`browserApiFetch()` awaits `ensureState()` before handling
`/v1/catalog/type-2/considerations`, so the live request does not race catalogue
configuration.

## 3. Compatibility boundary

The older score-based builder in `src/index.ts` remains only as an explicit
unconfigured compatibility fallback for non-browser/test consumers during the
migration boundary. It is no longer the configured physician-facing runtime
path.

The graph compatibility projection preserves the existing
`Type2AssessmentResult` shape while carrying an explicit
`GLYMIZE_DECISION_GRAPH_V2_AUTHORITY` marker, graph rank, component order, and
regimen identity. Its inherited legacy `priorityScore` field is neutralized to
zero and is not used as a clinical ranking signal.

This boundary is intentional so existing UI contracts can remain stable while
clinical authority changes underneath them.

## 4. Scenario layer must not become a second engine

`scenario-engine-safe.ts` detects graph-derived assessments and preserves
Decision Graph rank/component order directly. It may calculate or bound display
costs and apply an access-constrained presentation wrapper, but it does **not**
call the legacy aggregate-score scenario ranking path for graph-derived
assessments.

The authority marker is retained even when an access wrapper is required, so
integration tests can fail if a future change accidentally routes graph output
through a second independent scoring authority.

## 5. Stress and regression evidence

The established large-scale campaign remains the safety gate:

| Suite | Cases | Relevant authority |
| --- | ---: | --- |
| Heterogeneous clinical scenarios | 100,000 | Decision Graph v2 plus retained legacy invariants for compatibility coverage |
| Financial scenarios | 100,000 | Decision Graph v2 costing |
| Metamorphic scenarios | 50,000 | Decision Graph v2 |
| Adversarial numeric scenarios | 25,000 | Decision Graph v2 |

Phase 3 / Task 2 also adds `type2-live-authority-v2.test.ts`, covering configured
live authority, scenario-layer no-rescoring behavior, and the explicit
unconfigured legacy fallback.

## 6. What Task 2 does not change

- No guideline threshold, rule-pack parameter, evidence citation, or clinical
  source is changed by the convergence itself.
- No production/RC deployment, database migration, Cloudflare binding, secret,
  or infrastructure resource is changed.
- Catalogue persistence remains governed by
  `CATALOGUE_PERSISTENCE_DECISION.md`; this task does not implement that pending
  owner decision.
- The legacy builder is not deleted yet because non-live compatibility consumers
  still exist. Future removal requires consumer proof and its own behavior guard.

## 7. Verification anchors

| Fact | Anchor |
| --- | --- |
| Live browser submission | `apps/web/app/type-2/type2-scenarios-client.tsx` |
| Browser route waits for catalogue | `apps/web/lib/api-client.ts` → `browserApiFetch()` → `ensureState()` |
| Runtime root | `packages/clinical-engine/src/index-runtime.ts` |
| Live authority switch | `packages/clinical-engine/src/type2-decision-graph-runtime.ts` |
| UI compatibility projection | `packages/clinical-engine/src/type2-decision-graph-compat.ts` |
| Iran market adapter | `apps/web/lib/type2-decision-graph-market.ts` |
| No-second-score guard | `packages/clinical-engine/src/scenario-engine-safe.ts` |
| Integration regression | `packages/clinical-engine/test/type2-live-authority-v2.test.ts` |
| Validated engine | `packages/clinical-engine/src/decision-graph-v2/engine.ts` |
