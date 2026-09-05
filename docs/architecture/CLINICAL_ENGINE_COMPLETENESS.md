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
| liver | review only | Liver objective/context exists; dedicated liver product execution is pending |
| obesity | partially executable | Weight is a Type 2 preference/objective axis; this is not a standalone obesity engine |
| hypertension | executable | Confirmed/established treatment context plus guideline trigger and product rules |
| lipids | executable | Guideline statin objective plus reviewed product rules |
| heart_failure | executable | HF objective; HFrEF-specific MRA execution requires LVEF/eGFR/K |
| ascvd | executable | ASCVD organ-protection plus lipid objectives |
| masld_mash | review only | First completeness gap: current MASH pharmacotherapy protocol |
| neuropathy | review only | Painful DPN requires a physician-confirmed diagnosis-of-exclusion phenotype before medication execution |
| retinopathy | specialist/escalation | Ophthalmology referral/treatment pathway; no autonomous intravitreal prescribing |
| diabetic_foot | specialist/escalation | Infection/severity/source-control workflow first; no antibiotics for an uninfected ulcer |
| nutrition_support | review only | Requires a specific nutritional diagnosis/deficiency; diabetes alone is not an indication |
| pregnancy | safety context | Pregnancy currently drives exclusions/safety; complete pregnancy-treatment execution requires a separate audit |

## Priority closure sequence

### 1. MASH pharmacotherapy — next implementation

GLYMIZE already carries MASLD/MASH context (`masldMash`, fibrosis stage, cirrhosis/decompensation, AST/ALT, platelets, liver stiffness) and a `liver_directed_therapy` objective. The missing piece is exact product execution.

The next clinical PR should add, subject to verified Iranian market availability:

- **resmetirom** for adults with noncirrhotic MASH and F2-F3 fibrosis, with weight-tiered label dosing, cirrhosis/decompensation boundaries, CYP2C8 interaction handling, liver monitoring, and exact product evidence;
- **semaglutide/Wegovy MASH indication** for adults with noncirrhotic MASH and F2-F3 fibrosis, with the current product-label escalation/maintenance schedule and existing GLP-1 safety/duplication guards.

A drug with no current verified Iran-market product remains non-executable even if its international indication and dose protocol are valid.

### 2. Painful diabetic peripheral neuropathy

ADA 2026 recommends gabapentinoids, SNRIs, TCAs, and sodium-channel blockers as initial pharmacologic classes. This is not enough to activate drugs from a generic `neuropathy` checkbox: diabetic neuropathy is a diagnosis of exclusion. Before execution, add an explicit physician-confirmed painful-DPN phenotype and minimum safety inputs. Initial reviewed products should be limited to current-Iran-market agents with exact labels, such as pregabalin/duloxetine where available. Routine opioids must not enter the pathway.

### 3. Retinopathy

ADA 2026 recommends prompt ophthalmology referral for DME, moderate-or-worse NPDR, or PDR, and anti-VEGF is specialist eye therapy. The general Type 2 engine should first provide a structured referral/escalation card and evidence, not an autonomous injection regimen. Specialist-only product execution may be a separate later scope.

### 4. Diabetic foot

IWGDF/IDSA requires infection diagnosis/severity, pathogen context, source control, and patient factors before choosing antibiotics; clinically uninfected ulcers should not receive antibiotics. The next safe step is a structured ulcer/infection/severity/referral workflow. A generic `diabetic_foot=true` flag must never create empiric antibiotic prescribing by itself.

### 5. Nutrition support and pregnancy

These require separate indication-specific scope. Nutrition support must be driven by a documented deficiency/nutritional indication. Pregnancy remains a high-priority safety context until a dedicated diabetes-in-pregnancy execution audit proves the full insulin/monitoring pathway.

## UI dependency

The patient-entry UI should be built from these minimum-safe-input requirements after the engine closure work, rather than inventing fields independently. This avoids collecting data the engine cannot use and avoids omitting data that a product label requires.

The physician-assistant laboratory trend view should reuse longitudinal Patient Record v2 data. Priority trend candidates are HbA1c/glucose, eGFR/CrCl, UACR, potassium, LDL/TG, AST/ALT, weight/BMI, and blood pressure. No second lab-storage model should be introduced.

## Safety invariants

- WorldDrug visibility does not imply executable recommendation.
- No product executes without current Iran-market eligibility, reviewed clinical indication/objective, hard-gate safety, and an approved product-dose path.
- Regulatory label owns exact dose/adjustment; guideline owns treatment indication/goal.
- CrCl is never inferred from eGFR.
- Specialist procedures and diagnosis-dependent anti-infective treatment remain fail-closed until their required clinical phenotype is represented.
- Decision Graph v2 remains the sole executable/ranking authority; no additive medication score is introduced.
