# Clinical Hard-Exclusion Boundary

- Status: **Phase 3 / Task 4 implementation candidate**
- Date: 2026-09-05
- Roadmap reference: Phase 3 / Task 4 and §8.29
- Scope: ensure a hard contraindication or hard eligibility failure cannot re-enter any physician-facing compatibility result through legacy score ordering.

## 1. Decision Graph v2 invariant

The authoritative Decision Graph applies categorical hard gates before selection.
Candidates with `gate.status === "exclude"` are retained only in the diagnostic
`result.excluded` collection. Primary and alternative recommendations are built
from candidates that pass the hard-gate stage.

The Type 2 compatibility projection consumes only `result.primary` and
`result.alternatives`, so an excluded graph candidate is not projected into the
physician-facing medication list.

## 2. Retired score-builder gap

The old score-based builder predates the Decision Graph hard-gate model. It can
attach `blockedBy` while still calculating a numeric score and returning the
medication in a sorted list. That implementation remains internal only because
Phase 3 / Task 2 retained it as an explicit unconfigured fallback while legacy
consumers are retired.

Task 4 adds a structural compatibility firewall at the package runtime boundary:

`type2-decision-graph-runtime.ts`
→ legacy builder (only when no graph catalogue is configured)
→ `type2-hard-exclusion-compat.ts`
→ returned compatibility assessment

A true hard-excluded medication is removed from the returned list after the
retired builder executes and before any package consumer or safe scenario layer
receives the assessment. Its legacy numeric score therefore cannot promote it.

## 3. Hard exclusions covered by the compatibility firewall

The firewall mirrors the hard-block semantics already present in the retained
legacy compatibility path without changing their clinical values:

- metformin when eGFR is below the approved rule-pack contraindication threshold;
- thiazolidinediones when heart failure is present;
- resmetirom when non-cirrhotic MASH F2–F3 eligibility is not satisfied.

Thresholds and fibrosis stages continue to come from the approved versioned rule
pack. Task 4 does not invent or alter any clinical threshold, evidence source, or
rule activation state.

## 4. Soft risk is not a contraindication

The compatibility firewall deliberately does not treat every legacy `blockedBy`
string as a hard exclusion. For example, a sulfonylurea/meglitinide in a patient
with high hypoglycemia risk is a risk/de-prioritization concern in the retained
legacy model, not a categorical contraindication created by this task.

This distinction prevents an engineering refactor from silently converting a
soft clinical preference into a new hard rule.

## 5. Adversarial regression

`packages/clinical-engine/test/type2-hard-exclusion-v2.test.ts` includes an
adversarial case in which the retired score builder is intentionally given
weights that would rank a heart-failure-contraindicated TZD above a safe option.
The test proves that the package runtime still removes the TZD structurally.

The same suite verifies metformin renal exclusion, resmetirom eligibility
exclusion, and preservation of a non-hard hypoglycemia-risk option.

## 6. Out of scope

- No production/RC deployment or Cloudflare change.
- No migration, secret, or datastore change.
- No change to approved clinical values or citations.
- No attempt to rehabilitate the retired aggregate-score engine; final removal
  remains a separate consumer-retirement task.
