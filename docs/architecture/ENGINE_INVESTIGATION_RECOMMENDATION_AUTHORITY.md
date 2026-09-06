# Engine Investigation Recommendation Authority

- Status: **Queue #9 implementation**
- Date: 2026-09-07
- Roadmap reference: `GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md` §8 Missing-data investigation action; `IMPLEMENTATION_QUEUE_2026-08-15.md` item 9
- Scope: integrate `REQUEST_INVESTIGATION` as a fail-closed, non-order engine output without creating a second physician-order authority.

## 1. Authority boundary

`REQUEST_INVESTIGATION` is an engine recommendation only.

It is **not** a `PhysicianInvestigationOrder`, is not persisted as a signed order, and cannot enter a signed Final Plan without an explicit physician accept/modify action through the existing physician-order authority.

The engine may emit a recommendation only when all of the following are true:

1. the active Clinical Rule Pack is `approved` and validates successfully;
2. an approved rule contains an explicit `missingDataActions` entry;
3. that action names an allowed structured `requiredDataKey`;
4. that action names the Type 2 clinical factor that makes the datum relevant;
5. the factor is present in the current request/structured clinical context; and
6. the required datum is actually absent.

Missing data by itself is never sufficient to request a test.

## 2. Runtime projection

The live Type 2 runtime exposes an additive `investigationRecommendations` array beside the existing assessment and `parallelSafety` channel.

This channel is non-ranking and must not affect:

- medication score or rank;
- Decision Graph regimen selection;
- dose execution;
- scenario ordering;
- physician Final Plan persistence;
- Care Team fulfillment state.

The same projection is used for the legacy compatibility fallback and the configured Decision Graph/WorldDrug runtime so authority does not change with runtime mode.

## 3. Rule-pack safety

The existing bundled production Rule Pack remains clinically inert for this capability: no bundled rule receives a new `missingDataActions` entry in Queue #9.

This is intentional. Adding a real patient-facing investigation recommendation is a separate clinical-content change that requires:

- explicit evidence/source binding;
- a reviewed rule definition;
- a Rule Pack version/approval lifecycle;
- regression and safety tests for the relevant domain.

Queue #9 therefore establishes the execution boundary without silently approving a new test-ordering rule.

## 4. Supported data keys

The initial structured-key allowlist is restricted to existing Type 2 intake fields:

- `kidney.eGfr`
- `kidney.uacrMgG`
- `kidney.potassiumMmolL`
- `cardiovascular.lvefPercent`
- `liver.fibrosisStage`
- `liver.liverStiffnessKpa`
- `liver.astUeL`
- `liver.altUeL`
- `liver.plateletCount10e9L`
- `anthropometrics.weightKg`
- `anthropometrics.heightCm`

An unknown key causes rule-pack validation to fail rather than being interpreted dynamically.

## 5. Provenance

Each emitted `EngineInvestigationRecommendation` preserves:

- `investigationKey`;
- `requiredDataKey`;
- `reasonCode`;
- timing and priority;
- whether the missing datum blocks a treatment decision;
- originating rule id;
- active Rule Pack version; and
- evidence source ids.

This provenance must survive any later physician acceptance/modification bridge so the signed order can reference the source recommendation without treating it as the same object.

## 6. Regression guard

`packages/clinical-engine/test/engine-investigation-recommendation-v2.test.ts` verifies that:

1. the bundled production pack emits no investigation recommendation by default;
2. an explicit approved regression-only rule can emit `REQUEST_INVESTIGATION` when its factor is active and its required datum is missing;
3. presence of the datum suppresses the recommendation;
4. absence of the rule's trigger factor suppresses the recommendation;
5. the recommendation has no physician-order `id` or `status`; and
6. configured and compatibility runtime modes expose the same channel.

## 7. Out of scope

- No new clinical investigation is approved for production.
- No physician Final Plan acceptance UI is added.
- No database migration or new order storage is added.
- No payer/service-code logic is changed.
- No LLM is permitted to invent an investigation, timing, priority, reason, or missing-data key.
