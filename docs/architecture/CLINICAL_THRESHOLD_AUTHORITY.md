# Clinical Threshold Authority

- Status: **Phase 3 / Task 3 implementation candidate**
- Date: 2026-09-05
- Roadmap reference: Phase 3 / Task 3 and §8.28
- Scope: prevent independent copies of clinically meaningful Type 2 thresholds from drifting across the live Decision Graph and its safety rules.

## 1. Authority rule

Shared Type 2 clinical thresholds are authored in the approved, versioned clinical rule pack in:

`packages/clinical-engine/src/rule-pack.ts`

The live Decision Graph may translate those parameters into its own policy contract, but it must not independently re-author the same clinical values.

The current approved Type 2 parameters include:

| Meaning | Rule-pack parameter | Approved value |
| --- | --- | ---: |
| Severe-hyperglycemia A1C trigger | `severeHyperglycemiaA1cThreshold` | 10 |
| Combination-therapy A1C gap | `combinationTherapyGap` | 1.5 |
| Metformin hard renal contraindication | `metforminContraindicatedBelowEgfr` | 30 |
| Metformin renal review boundary | `metforminReviewBelowEgfr` | 45 |
| SGLT2 specialist-review boundary | `sglt2SpecialistReviewBelowEgfr` | 20 |

Task 3 does **not** change any of those values, evidence sources, or approval state.

## 2. Decision Graph policy

`decision-graph-v2/policy.ts` now maps the shared pathway parameters from the rule pack:

- `severeHyperglycemiaA1cExclusiveAbove` ← `severeHyperglycemiaA1cThreshold`
- `combinationTherapyA1cGapAtOrAbove` ← `combinationTherapyGap`

`runDecisionGraphV2()` resolves the policy from the active approved rule pack when the caller does not supply an explicit policy. This preserves explicit-policy testability while making the normal live path follow the active clinical rule authority.

Decision Graph-only operating parameters such as glucose 300 mg/dL, fasting/postprandial targets, overbasalization delta, and alternative-count remain in the Decision Graph policy because they are not duplicates of the named Type 2 rule-pack parameters covered by this task.

## 3. Metformin safety gates

`decision-graph-v2/safety-rules.ts` now reads the metformin renal hard-gate and review boundaries from the active rule pack instead of repeating executable `30` and `45` literals.

The hard exclusion and conditional review remain categorical rules; Task 3 does not convert them to scores or alter their precedence.

## 4. Product-dose thresholds are not automatically shared thresholds

`decision-graph-v2/product-dose-rules.ts` contains renal boundaries of 30 and 45 for **sitagliptin product-label dose selection**. Those numbers happen to equal the current metformin renal boundaries, but they have a different clinical meaning, evidence authority, and change lifecycle.

Therefore they deliberately remain product-label dose rules and are **not** sourced from metformin Type 2 rule-pack parameters. Coupling them only because the numeric values match would create an unsafe semantic dependency.

The Task 3 regression test changes the active metformin thresholds during the test and proves that sitagliptin label-dose boundaries remain 30/45.

## 5. Regression guard

`packages/clinical-engine/test/clinical-threshold-authority-v2.test.ts` verifies that:

1. Decision Graph pathway thresholds resolve from the active approved rule pack.
2. Metformin renal hard-gate thresholds resolve from the same active rule pack.
3. Sitagliptin label renal-dose boundaries remain independent from metformin core thresholds.

This guard is intended to fail if a future change reintroduces a second independently authored copy of the shared Type 2 values or incorrectly couples unrelated product-label thresholds.

## 6. Out of scope

- No clinical threshold value is changed.
- No guideline or regulatory citation is added or replaced.
- No ranking/scoring behavior is introduced.
- No production/RC deployment, migration, secret, Cloudflare binding, or data-store change is included.
