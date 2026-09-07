import type { Type2ClinicalInputDefinitionV2 } from "./types.js";

export const type2CoreInputCatalogV2 = {
  "core.current_hba1c": {
    requestSupport: "request_field",
    requestPath: "currentHba1c",
    description: "Current HbA1c for the assessment",
  },
  "core.target_hba1c": {
    requestSupport: "request_field",
    requestPath: "targetHba1c",
    description: "Clinician-selected HbA1c target",
  },
  "core.current_medications": {
    requestSupport: "request_field",
    requestPath: "currentMedications",
    description: "Current medication reconciliation",
  },
  "current_medication.interval_stage_reconciliation": {
    requestSupport: "not_represented",
    description: "Exact administration interval, days on current dose, therapy phase, and next-administration timing required by interval-aware continuation are not carried through the current Type 2 clinician intake into Decision Graph",
  },
  "core.age_years": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.ageYears",
    description: "Patient age in years",
  },
  "core.pregnancy": {
    requestSupport: "runtime_derived",
    requestPath: "factors[pregnancy] -> clinicalContext.pregnancy",
    description: "Pregnancy context derived by the intake adapter from the explicit pregnancy decision factor when a direct clinical-context value is absent",
  },
  "core.hyperglycemia_symptoms": {
    requestSupport: "request_field",
    requestPath: "hyperglycemiaSymptoms",
    description: "Clinician-entered hyperglycemia symptoms",
  },
  "core.catabolic_features": {
    requestSupport: "request_field",
    requestPath: "catabolicFeatures",
    description: "Clinician-entered catabolic features",
  },
  "cardiovascular.ascvd": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.cardiovascular.ascvd",
    description: "Established ASCVD phenotype",
  },
  "cardiovascular.heart_failure": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.cardiovascular.heartFailure",
    description: "Established heart-failure phenotype",
  },
  "cardiovascular.lvef_percent": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.cardiovascular.lvefPercent",
    description: "Left-ventricular ejection fraction",
  },
  "cardiovascular.nyha_class": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.cardiovascular.nyhaClass",
    description: "NYHA functional class",
  },
  "cardiovascular.systolic_bp": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.cardiovascular.systolicBloodPressure",
    description: "Systolic blood pressure",
  },
  "cardiovascular.diastolic_bp": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.cardiovascular.diastolicBloodPressure",
    description: "Diastolic blood pressure",
  },
  "kidney.ckd": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.kidney.ckd",
    description: "Established CKD context",
  },
  "kidney.egfr": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.kidney.eGfr",
    description: "Estimated GFR",
  },
  "kidney.creatinine_clearance": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.kidney.creatinineClearanceMlMin",
    description: "Explicit clinician/source-provided creatinine clearance; never inferred from eGFR",
  },
  "kidney.uacr": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.kidney.uacrMgG",
    description: "Urine albumin-to-creatinine ratio",
  },
  "kidney.potassium": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.kidney.potassiumMmolL",
    description: "Serum potassium",
  },
  "kidney.dialysis": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.kidney.dialysis",
    description: "Dialysis status",
  },
  "liver.masld_mash": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.liver.masldMash",
    description: "Confirmed MASLD/MASH context",
  },
  "liver.fibrosis_stage": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.liver.fibrosisStage",
    description: "Fibrosis stage",
  },
  "liver.cirrhosis": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.liver.cirrhosis",
    description: "Cirrhosis status",
  },
  "liver.decompensated_cirrhosis": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.liver.decompensatedCirrhosis",
    description: "Decompensated cirrhosis status",
  },
  "anthropometrics.weight_kg": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.anthropometrics.weightKg",
    description: "Actual body weight",
  },
  "anthropometrics.bmi": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.anthropometrics.bmi",
    description: "BMI supplied or calculated from represented anthropometrics",
  },
  "glycemia.fasting": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.glycemia.fastingPlasmaGlucoseMgDl",
    description: "Fasting plasma glucose",
  },
  "glycemia.two_hour_postprandial": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.glycemia.twoHourPostprandialGlucoseMgDl",
    description: "Two-hour postprandial glucose",
  },
  "glycemia.random": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.glycemia.randomGlucoseMgDl",
    description: "Random glucose",
  },
} as const satisfies Record<string, Type2ClinicalInputDefinitionV2>;
