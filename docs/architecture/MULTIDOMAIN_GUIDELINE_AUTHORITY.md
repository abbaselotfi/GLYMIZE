# Multidomain guideline authority

Status: Phase 4 foundation

## Why this boundary exists

GLYMIZE now surfaces approved WorldDrug medicines across the diabetes-related clinical domains, but catalogue presence is not permission to prescribe or rank a medicine. A safe executable recommendation requires several independent authorities to agree.

## Authority chain

1. **Patient clinical context**
   - establishes the actual problem/phenotype (for example CKD, albuminuria, HFrEF, hypertension, dyslipidemia, MASH, neuropathy, retinopathy, pregnancy);
   - no diagnosis is inferred merely because a medicine exists in the catalogue.

2. **Clinical guideline / consensus**
   - determines whether a class or therapeutic strategy is indicated, preferred, optional, contraindicated, or requires specialist/parallel care;
   - determines treatment goals and indication-specific monitoring expectations;
   - must be represented in `activeGuidelineSources` and then explicitly bound to a reviewed rule before it can affect the Decision Graph.

3. **Regulatory/product label**
   - owns exact starting dose, strength/form constraints, titration, maximum dose, indication-specific dose, renal/hepatic dose adjustment and product-specific contraindications;
   - GLYMIZE must not synthesize a class-average dose when an exact reviewed product rule is absent.

4. **WorldDrug / Master Registry**
   - owns medicine identity, synonyms, drug class, therapeutic areas and structured clinical-domain metadata;
   - it is catalogue knowledge, not an independent treatment-ranking authority.

5. **Iran market / NFI / insurer provenance**
   - determines current Iranian product presence, presentations, observed price and insurance evidence;
   - access/cost may order already acceptable options but never override safety, indication or structural exclusions.

## Phase 4 source coverage

The original registry already included ADA 2026 Section 9, ADA/EASD 2022, KDIGO 2024, KDIGO Diabetes-CKD 2022, ESC Diabetes-CVD 2023, EASL MASLD 2024 and IWGDF 2023.

The multidomain foundation additionally registers:

- ADA 2026 Section 10 — cardiovascular risk, hypertension, lipids and RAAS-related diabetes care;
- ADA 2026 Section 11 — CKD, optimized RAS blockade and finerenone/nonsteroidal MRA use;
- ADA 2026 Section 12 — retinopathy, neuropathy and foot care;
- ADA 2026 Section 15 — medication safety and diabetes treatment in pregnancy;
- 2025 ACC/AHA High Blood Pressure Guideline;
- 2026 ACC/AHA Dyslipidemia Guideline;
- 2022 AHA/ACC/HFSA Heart Failure Guideline;
- 2024 ACC HFrEF Expert Consensus Decision Pathway;
- AASLD October 2024 resmetirom practice-guidance update;
- AASLD November 2025 semaglutide/MASH practice-guidance update.

## What source registration does NOT do

Adding a source to the evidence registry does not create a score, mandatory objective, dose rule, contraindication, or treatment scenario. This is intentional. Guideline updates are monitored evidence; activation requires a separate reviewed code/rule change and regression tests.

Therefore WorldDrug options without an approved executable protocol remain `requires_approved_protocol` and review-only.

## Next executable cohort

Before hypertension/lipid/HF/renal objectives are allowed to select additional WorldDrug therapies as executable recommendations, Phase 4 must add exact reviewed rules for the first cohort:

- Enalapril
- Losartan
- Valsartan
- Atorvastatin
- Rosuvastatin
- Finerenone
- Spironolactone

For each medicine the implementation must bind:

- guideline indication/clinical objective;
- required patient facts and missing-data behavior;
- structural contraindications/eligibility gates;
- exact regulatory-label starting dose and titration where applicable;
- monitoring (for example renal function and potassium when clinically required);
- current Iranian-market product eligibility independently from clinical authority.

Only after those protocols are complete and tested should their mandatory objectives be activated in the live Decision Graph.
