export type Type2ClinicalInputRequestSupportV2 =
  | "request_field"
  | "request_composite"
  | "runtime_derived"
  | "not_represented";

export interface Type2ClinicalInputDefinitionV2 {
  requestSupport: Type2ClinicalInputRequestSupportV2;
  requestPath?: string;
  description: string;
}

/**
 * Stable semantic identifiers for Type 2 clinical inputs.
 *
 * This catalogue is a drift/coverage contract only. It must never be parsed into
 * clinical execution rules, and `requestPath` is descriptive rather than a
 * dynamic object accessor. Missing/unrepresented facts remain fail-closed.
 */
export const type2ClinicalInputCatalogV2 = {
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
  "core.age_years": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.ageYears",
    description: "Patient age in years",
  },
  "core.pregnancy": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.pregnancy",
    description: "Explicit pregnancy context",
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
  "neuropathy.dpn_confirmed": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.neuropathy.diabeticPeripheralNeuropathyConfirmed",
    description: "Clinician-confirmed diabetic peripheral neuropathy",
  },
  "neuropathy.painful_symptoms": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.neuropathy.painfulSymptoms",
    description: "Painful symptoms attributable to DPN",
  },
  "neuropathy.atypical_features": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.neuropathy.atypicalFeaturesPresent",
    description: "Atypical neuropathy features requiring diagnostic review",
  },
  "medication_safety.maoi_exposure": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.medicationSafety.maoiUseOrRecentExposure",
    description: "Current/recent MAOI exposure relevant to duloxetine",
  },
  "medication_safety.substantial_alcohol_use": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.medicationSafety.substantialAlcoholUse",
    description: "Substantial alcohol use relevant to duloxetine safety",
  },
  "medication_safety.pregabalin_hypersensitivity": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.medicationSafety.knownPregabalinHypersensitivity",
    description: "Known pregabalin hypersensitivity",
  },
  "retinopathy.severity": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.retinopathy.severity",
    description: "Diabetic retinopathy severity",
  },
  "retinopathy.dme": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.retinopathy.diabeticMacularEdema",
    description: "Diabetic macular edema status",
  },
  "retinopathy.center_involving_dme": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.retinopathy.centerInvolvingDme",
    description: "Center-involving DME status",
  },
  "retinopathy.visual_acuity_context": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.retinopathy.visualAcuityImpairmentAttributedToDme",
    description: "Visual-acuity impairment attributed to DME",
  },
  "diabetic_foot.ulcer": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.diabeticFoot.footUlcerPresent",
    description: "Diabetes-related foot ulcer status",
  },
  "diabetic_foot.clinical_infection": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.diabeticFoot.clinicalInfectionPresent",
    description: "Clinical infection assessment",
  },
  "diabetic_foot.infection_severity": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.diabeticFoot.infectionSeverity",
    description: "IWGDF/IDSA infection severity",
  },
  "diabetic_foot.pad": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.diabeticFoot.peripheralArteryDisease",
    description: "Peripheral arterial disease/ischemia context",
  },
  "diabetic_foot.danger_features": {
    requestSupport: "request_composite",
    requestPath: "clinicalContext.diabeticFoot",
    description: "Structured source-control danger features such as gangrene, necrotising infection, abscess, compartment syndrome, or severe ischaemia",
  },
  "diabetic_foot.osteomyelitis": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.diabeticFoot.osteomyelitisSuspected",
    description: "Osteomyelitis suspicion",
  },
  "nutrition.intent": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.nutritionSupport.intent",
    description: "Explicit nutrition-support intent",
  },
  "nutrition.documented_deficiency": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.nutritionSupport.documentedMicronutrientDeficiency",
    description: "Documented micronutrient deficiency status",
  },
  "nutrition.deficiency_name": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.nutritionSupport.deficiencyName",
    description: "Named deficiency when applicable",
  },
  "nutrition.objective_deficiency_data": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.nutritionSupport.deficiencyLabValueKnown",
    description: "Whether objective deficiency laboratory data are known",
  },
  "nutrition.malnutrition_or_special_population": {
    requestSupport: "request_composite",
    requestPath: "clinicalContext.nutritionSupport",
    description: "Malnutrition risk/diagnosis or represented special-population context",
  },
  "pregnancy.diabetes_type": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.pregnancyCare.diabetesType",
    description: "Explicit pregnancy diabetes type (T1D/T2D/GDM)",
  },
  "pregnancy.glycemia": {
    requestSupport: "request_composite",
    requestPath: "clinicalContext.glycemia",
    description: "Pregnancy-specific represented glucose data",
  },
  "pregnancy.hypoglycemia_context": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.pregnancyCare.significantHypoglycemiaPreventingTightTarget",
    description: "Significant hypoglycemia preventing tighter pregnancy targets",
  },
  "pregnancy.specialist_team": {
    requestSupport: "request_field",
    requestPath: "clinicalContext.pregnancyCare.pregnancySpecialistTeamEstablished",
    description: "Pregnancy-diabetes specialist-team context",
  },
  "safety.product_specific_screen": {
    requestSupport: "not_represented",
    description: "Product-specific contraindication/interaction screening not yet represented by a complete Type 2 request field set",
  },
  "hypertension.established_treatment_context": {
    requestSupport: "not_represented",
    description: "Established hypertension-treatment context beyond a single encounter BP",
  },
} as const satisfies Record<string, Type2ClinicalInputDefinitionV2>;

export type Type2ClinicalInputIdV2 = keyof typeof type2ClinicalInputCatalogV2;

export interface Type2CapabilityInputContractV2 {
  /** Stable input identities that directly represent the capability's core minimum-safe-input concepts. */
  core: readonly Type2ClinicalInputIdV2[];
  /** Inputs needed only for a represented phenotype, product, dose, or safety branch. */
  conditional: readonly Type2ClinicalInputIdV2[];
}

export function type2ClinicalInputDefinitionV2(id: Type2ClinicalInputIdV2) {
  return type2ClinicalInputCatalogV2[id];
}
