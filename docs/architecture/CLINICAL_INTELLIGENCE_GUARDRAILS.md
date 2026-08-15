# GLYMIZE Clinical Intelligence Architecture Notes

This note supplements `docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md` with clinical guardrails accepted on 2026-08-15.

## Bone health / calcium

Do not implement `age >60 => calcium prescription` as a rule. Bone-health logic must use fracture-risk context, diet/intake, BMD and other validated risk factors. In diabetes care, adequate calcium/vitamin D intake should be ensured, but supplementation is conditional rather than automatically triggered by age alone.

## ESR

ESR is stored as a standard lab observation and may contribute to an inflammation/red-flag review. It is nonspecific and must not create a disease diagnosis or medication recommendation on its own. Prefer the laboratory's own reference range and interpret with age/sex/context plus CRP/CBC/symptoms where available.

## Persistent anemia despite B12

A high/adequate B12 value does not close the anemia work-up. If anemia persists despite B12 replacement, GLYMIZE should surface a high-priority `unexplained/persistent anemia` review signal when a validated hematology rule pack has sufficient context. It may prompt relevant missing data and specialist referral consideration, but must not infer a specific malignancy or hematologic diagnosis from incomplete data.

## Multi-domain scenarios

Diabetes care scenarios must include clinically relevant non-glycemic domains as validated rule packs become available, including lipid/ASCVD, blood pressure, kidney, liver, bone, hematology/deficiency and other important findings. The medication registry can supply candidate products, but the registry itself is not clinical authority.

## Research behavior analytics

Future research on physician prescribing preferences must be privacy-preserving and cohort-oriented. Never export physician name, Medical Council number, email or another direct/stable public identifier in research datasets. Individual private feedback may be offered to the physician; public/scientific reporting must use anonymized/cohort-level analysis with minimum sample safeguards.
