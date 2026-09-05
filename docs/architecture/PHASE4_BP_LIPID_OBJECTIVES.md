# Phase 4 Task 7 — Blood-pressure and lipid objectives

## Authority

Phase 4 Task 7 adds only named ADA Standards of Care in Diabetes—2026 Section 10 triggers to the existing Decision Graph v2 objective model. It does not add a second medication score or a parallel prescribing engine.

Primary source:

- ADA Standards of Care in Diabetes—2026, Section 10: Cardiovascular Disease and Risk Management.
- Blood pressure: Recommendations 10.1, 10.6, 10.8, 10.10.
- Lipids/statins: Recommendations 10.18–10.28 and Table 10.1.

## Blood-pressure execution boundary

A single encounter blood-pressure reading is not treated as a diagnosis of hypertension.

The `blood_pressure_control` objective is executable only when all of the following are represented:

1. the patient is not pregnant;
2. systolic BP is at least 130 mmHg or diastolic BP is at least 80 mmHg;
3. a Task 6 ACEi/ARB indication is represented (albuminuria, reduced eGFR, or represented CAD/prior-MI context); and
4. the current medication context demonstrates established antihypertensive treatment.

When the BP threshold and RAAS indication are present but established hypertension cannot be confirmed from the current treatment context, the engine does not initiate new RAAS support. It emits `cardiovascular.hypertensionConfirmation` as recommended, non-blocking missing data.

This is deliberately narrower than the full hypertension formulary because Task 6 does not yet contain the complete thiazide-like diuretic and dihydropyridine calcium-channel-blocker lanes.

## Lipid execution boundary

- Age 40–75 years with diabetes: `lipid_risk_reduction` is mandatory for baseline statin primary prevention without requiring an invented baseline LDL trigger.
- Established ASCVD: lipid risk reduction remains a mandatory objective; exact intensity and dose remain governed by reviewed product-dose execution and clinician confirmation.
- Age 20–39 years with a represented additional ASCVD risk factor: statin initiation remains a preference-level individualized consideration.
- Age >75 years: new statin initiation remains preference-level and requires individualized benefit-risk discussion.
- Pregnancy: the general Task 7 BP/lipid pathway does not create executable objectives; pregnancy-specific safety handling remains separate.

## Task 8 dependency

Task 7 is implemented after Task 8 so supporting RAAS/statin components can only become executable when an approved product-dose rule or an explicitly documented current dose exists. This prevents guideline objectives from creating dose-less support regimens.

## Composition and duplicate avoidance

The existing regimen composer remains authoritative:

- only `pass` candidates may serve non-glycemic support lanes;
- the candidate must cover the target objective and lane;
- exact therapy-group duplication is a structural conflict;
- an existing compatible molecule is preferred over adding a duplicate molecule;
- no aggregate medication score is introduced by Task 7.
