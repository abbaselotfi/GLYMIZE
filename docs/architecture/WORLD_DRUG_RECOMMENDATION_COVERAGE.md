# WorldDrug recommendation coverage boundary

## Purpose

GLYMIZE keeps two different concepts separate:

1. **Executable Decision Graph recommendation** — a medicine/regimen that has passed the active clinical objectives, hard gates, current Iran-market checks, and an approved structured rule/protocol required for execution.
2. **WorldDrug clinical review option** — an approved WorldDrug/Master Registry medicine that matches an active patient clinical domain and has verified current Iran-market presence, but does not yet have enough reviewed execution knowledge to be prescribed by the engine.

The second category exists so clinically relevant cardiac, renal, hepatic, neurologic, ophthalmic and other WorldDrug-backed medicines are not silently hidden from the clinician merely because the corresponding executable protocol is still being built.

## Invariants

A WorldDrug review option may be shown only when all of the following are true:

- the Master Registry entry has `reviewState: approved`;
- the entry matches an active patient clinical domain or an explicitly supplied reviewed therapeutic area;
- the existing Iran inventory adapter confirms a current, verified market relationship;
- the option is not removed by an already-known structural hard exclusion;
- source codes and source URLs remain attached to the displayed option.

A review-only option is emitted with:

- `outputStatus: requires_approved_protocol`;
- `priorityScore: 0`;
- no `decisionGraphRank`;
- no right to enter Decision Graph Top 3 selection;
- an explicit clinician-facing warning that it is not an executable prescribing recommendation.

`scenario-engine-worlddrug-safe.ts` strips review-only medicines before calling the Decision Graph scenario wrapper and appends them afterward in a separate `worlddrug_review` informational card. The card is outside the clinical Top 3 even though the shared scenario contract still requires a structural `rank` field.

## Domain coverage

The projection understands every currently declared `MedicationClinicalDomain` in the shared contracts:

- diabetes
- cardiovascular
- kidney
- liver
- obesity
- hypertension
- lipids
- heart_failure
- ascvd
- masld_mash
- neuropathy
- retinopathy
- diabetic_foot
- nutrition_support
- pregnancy

Structured WorldDrug clinical effects are preferred. Therapeutic-area/indication text is used only to classify review relevance, never to create an executable dose or hard clinical rule.

For clinical areas not yet represented by the legacy Type 2 factor controls, the projection accepts forward-compatible `activeClinicalDomains` and `activeTherapeuticAreas` fields. A patient problem-list/domain-input surface must populate those fields before end-to-end UI coverage can be considered complete for those areas.

## Iran market and financial data

This layer does not invent brands, prices or insurance coverage. Current-market eligibility comes from the existing NFI-backed inventory adapter. When several verified current products exist, review display may expose a generic NFI price range; it does not choose an arbitrary brand or fabricate a monthly treatment cost without an approved/entered dose and package basis.

## Relationship to Phase 4 Tasks 7 and 8

This coverage boundary is a prerequisite repair discovered while validating Task 7. It does not replace guideline objectives or product-dose rules.

- Task 7 defines named guideline-backed clinical objective triggers.
- Task 8 adds exact reviewed drug/product dosing and titration rules with precise citations.
- Once a review-only WorldDrug option gains the required approved rules and satisfies Decision Graph objectives/gates, it can become an executable recommendation through the normal engine path; this projection never promotes it by itself.
