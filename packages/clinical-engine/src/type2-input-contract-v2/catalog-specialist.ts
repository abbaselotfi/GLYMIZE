import type { Type2ClinicalInputDefinitionV2 } from "./types.js";

export const type2SpecialistInputCatalogV2 = {
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
    requestSupport: "runtime_derived",
    requestPath: "currentMedications[].therapyGroup -> active antihypertensive treatment context",
    description: "Established hypertension-treatment context derived only from active current medication with a trusted catalogue therapy group (RAAS blocker, antihypertensive, or mineralocorticoid receptor antagonist); a BP reading or free-text medicine name alone cannot create it",
  },
} as const satisfies Record<string, Type2ClinicalInputDefinitionV2>;
