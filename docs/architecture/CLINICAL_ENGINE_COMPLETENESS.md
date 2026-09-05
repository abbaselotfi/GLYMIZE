# Clinical Engine Completeness Matrix

Status date: 2026-09-05

This document separates **catalogue visibility** from **executable clinical authority**. All current GLYMIZE medication domains can surface relevant approved/current-Iran-market WorldDrug entries for clinician review, but only domains with a reviewed Decision Graph objective, safety gates, product-specific dose execution, and sufficient patient inputs may appear as executable treatment support.

The machine-readable source of truth for the states below is `packages/clinical-engine/src/clinical-domain-capabilities.ts`.

## Capability states

| Domain | State | Current safe boundary |
| --- | --- | --- |
| diabetes | executable | Decision Graph v2 glycemic/insulin pathway with reviewed product-dose rules |
| cardiovascular | partially executable | Executable through represented ASCVD/HF/BP/lipid phenotypes, not from a generic cardiovascular flag |
| kidney | executable | CKD/eGFR/UACR/K/CrCl-aware cardiorenal pathway |
| liver | partially executable | Reviewed resmetirom and product-bound WEGOVY initiation for explicit adult noncirrhotic F2-F3 MASH; broader liver therapy remains scoped |
| obesity | partially executable | Weight is a Type 2 preference/objective axis; this is not a standalone obesity engine |
| hypertension | executable | Confirmed/established treatment context plus guideline trigger and product rules |
| lipids | executable | Guideline statin objective plus reviewed product rules |
| heart_failure | executable | HF objective; HFrEF-specific MRA execution requires LVEF/eGFR/K |
| ascvd | executable | ASCVD organ-protection plus lipid objectives |
| masld_mash | partially executable | Reviewed resmetirom and product-bound WEGOVY initiation only; continuation/titration-cost completeness remains bounded |
| neuropathy | partially executable | Only clinician-confirmed painful DPN without atypical features can enter reviewed pregabalin/duloxetine protocols; routine opioids remain excluded |
| retinopathy | specialist/escalation | Prompt ophthalmology escalation for any DME, moderate-or-worse NPDR, or PDR; no autonomous intravitreal/laser prescribing |
| diabetic_foot | specialist/escalation | Structured infection/severity/source-control/referral workflow; no antibiotics for an uninfected ulcer and no generic empiric antibiotic lane |
| nutrition_support | review only | Explicit indication/deficiency safety pathway exists; diabetes alone cannot create vitamin/mineral/herbal or enteral/parenteral prescription execution |
| pregnancy | safety context | Dedicated pregnancy diabetes pathway owns pregnancy targets, T1/T2/GDM treatment boundary and medication reconciliation; insulin dose/titration remains clinician/team controlled |

## Priority closure sequence — completed through Task 10/30

### 1. MASH pharmacotherapy — closed for reviewed initiation scope

Reviewed resmetirom and product-bound WEGOVY initiation now execute only for the explicitly represented adult noncirrhotic F2-F3 MASH phenotype after product-specific safety and Iran-market gates pass. Broader liver pharmacotherapy remains out of scope. WEGOVY continuation and multi-step titration costing remain explicitly bounded follow-up work rather than silently claimed completeness.

### 2. Painful diabetic peripheral neuropathy — closed for reviewed first products

The engine now requires a clinician-confirmed DPN diagnosis-of-exclusion phenotype, painful symptoms and absence of atypical features before execution. Reviewed pregabalin and duloxetine branches carry their renal/hepatic/MAOI/alcohol/hypersensitivity safety requirements and product-label dose authority. Generic neuropathy activation and routine opioid therapy do not become executable.

### 3. Retinopathy — specialist escalation lane implemented

ADA 2026 referral criteria are represented as a separate specialist channel: any DME, moderate-or-worse NPDR, or PDR produces prompt ophthalmology escalation. Anti-VEGF, laser and other ophthalmic treatment evidence remain specialist-only and outside the general medication-ranking authority.

### 4. Diabetic foot — safety/escalation lane implemented

The engine now requires a clinical infection assessment and, when infection is present, IWGDF/IDSA severity plus represented danger/PAD/osteomyelitis context. Clinically uninfected ulcers cannot execute antibiotics. Severe or dangerous moderate infection can trigger hospital/surgical/vascular escalation and source-control guidance, while antimicrobial product selection remains fail-closed pending pathogen, susceptibility, allergy, renal/interaction and local-protocol inputs.

### 5. Nutrition support — indication boundary implemented

Nutrition support remains review-only for prescription execution. The engine now distinguishes glycemic-supplement intent, documented deficiency, malnutrition and special-population review. Diabetes alone is never treated as an indication for vitamin/mineral/herbal or enteral/parenteral therapy, and no generic supplement dose is fabricated.

### 6. Pregnancy — dedicated safety/therapy boundary implemented

The pregnancy pathway requires explicit T1D/T2D/GDM classification, uses pregnancy-specific glycemic targets, marks insulin required for T1D and preferred for T2D, supports lifestyle-first GDM with insulin escalation review when represented glucose exceeds target, and performs noninsulin glucose-lowering medication reconciliation. Exact insulin product selection, initiation and frequent gestation/postpartum titration remain non-autonomous until a separate product-level pregnancy protocol is proven.

## Next closure work

With the five previously prioritized gaps now structurally closed at their stated safe boundaries, the next work should proceed from the machine-readable capability gaps rather than reopen completed scopes. Immediate candidates are:

1. capability/UI input contract generation from `minimumSafeInputs`, so patient-entry and physician workflows collect the exact facts used by the engine;
2. interval-aware current-medication reconciliation and multi-step titration costing for WEGOVY continuation;
3. additional reviewed painful-DPN product/renal branches without expanding into routine opioid use;
4. specialist-only retinopathy execution only as a separately isolated future scope;
5. pathogen/local-protocol-aware diabetic-foot antimicrobial execution only after the required data model exists;
6. nutrient-specific treatment protocols and pregnancy insulin product/titration protocols only after dedicated label-level audits.

## UI dependency

The patient-entry UI should be built from these minimum-safe-input requirements after the engine closure work, rather than inventing fields independently. This avoids collecting data the engine cannot use and avoids omitting data that a product label requires.

The physician-assistant laboratory trend view should reuse longitudinal Patient Record v2 data. Priority trend candidates are HbA1c/glucose, eGFR/CrCl, UACR, potassium, LDL/TG, AST/ALT, weight/BMI, and blood pressure. No second lab-storage model should be introduced.

## Safety invariants

- WorldDrug visibility does not imply executable recommendation.
- No product executes without current Iran-market eligibility, reviewed clinical indication/objective, hard-gate safety, and an approved product-dose path.
- Regulatory label owns exact dose/adjustment; guideline owns treatment indication/goal.
- CrCl is never inferred from eGFR.
- Specialist procedures and diagnosis-dependent anti-infective treatment remain fail-closed until their required clinical phenotype is represented.
- Nutrition-support and pregnancy safety pathways do not become autonomous product/dose authorities merely because their clinical boundary is represented.
- Parallel specialist/safety trace nodes are identified by stable `nodeId`, not by array position.
- Decision Graph v2 remains the sole executable/ranking authority; no additive medication score is introduced.
