import type { Type2ClinicalInputIdV2 } from "@glymize/clinical-engine/type2-input-contract-v2";

export type Type2UiInputCollectionStateV2 =
  | "collected"
  | "derived"
  | "not_collected"
  | "not_represented";

export interface Type2UiInputCoverageEntryV2 {
  state: Type2UiInputCollectionStateV2;
  surface: "core_form" | "structured_form" | "runtime_adapter" | "none";
  note?: string;
}

/**
 * Explicit coverage map between the clinician-facing Type 2 intake and the
 * machine-readable clinical input catalogue.
 *
 * This is drift metadata only. It does not populate request values and must not
 * be used to infer missing clinical facts. `not_collected` and `not_represented`
 * inputs remain absent/fail-closed at runtime.
 */
export const type2UiInputCoverageV2 = {
  "core.current_hba1c": { state: "collected", surface: "core_form" },
  "core.target_hba1c": { state: "collected", surface: "core_form" },
  "core.current_medications": { state: "collected", surface: "core_form" },
  "current_medication.interval_stage_reconciliation": {
    state: "not_represented",
    surface: "none",
    note: "The current Type 2 clinician intake does not carry explicit administration interval, days on current dose, therapy phase, or next-administration timing through to Decision Graph.",
  },
  "core.age_years": {
    state: "not_collected",
    surface: "none",
    note: "The request contract supports ageYears, but the current Type 2 clinician form does not collect it.",
  },
  "core.pregnancy": {
    state: "derived",
    surface: "runtime_adapter",
    note: "The explicit pregnancy factor is converted to patient.pregnancy by the Type 2 intake adapter when no direct value is supplied.",
  },
  "core.hyperglycemia_symptoms": { state: "collected", surface: "core_form" },
  "core.catabolic_features": { state: "collected", surface: "core_form" },
  "cardiovascular.ascvd": { state: "collected", surface: "core_form" },
  "cardiovascular.heart_failure": { state: "collected", surface: "core_form" },
  "cardiovascular.lvef_percent": { state: "collected", surface: "core_form" },
  "cardiovascular.nyha_class": { state: "collected", surface: "core_form" },
  "cardiovascular.systolic_bp": { state: "collected", surface: "core_form" },
  "cardiovascular.diastolic_bp": { state: "collected", surface: "core_form" },
  "kidney.ckd": { state: "collected", surface: "core_form" },
  "kidney.egfr": { state: "collected", surface: "core_form" },
  "kidney.creatinine_clearance": {
    state: "not_collected",
    surface: "none",
    note: "CrCl exists in the request/Decision Graph contracts but must never be inferred from the eGFR field.",
  },
  "kidney.uacr": { state: "collected", surface: "core_form" },
  "kidney.potassium": { state: "collected", surface: "core_form" },
  "kidney.dialysis": { state: "collected", surface: "core_form" },
  "liver.masld_mash": { state: "collected", surface: "core_form" },
  "liver.fibrosis_stage": { state: "collected", surface: "core_form" },
  "liver.cirrhosis": { state: "collected", surface: "core_form" },
  "liver.decompensated_cirrhosis": { state: "collected", surface: "core_form" },
  "anthropometrics.weight_kg": { state: "collected", surface: "core_form" },
  "anthropometrics.bmi": {
    state: "derived",
    surface: "core_form",
    note: "BMI is calculated from explicitly entered weight and height before the request is sent.",
  },
  "glycemia.fasting": { state: "collected", surface: "structured_form" },
  "glycemia.two_hour_postprandial": { state: "collected", surface: "structured_form" },
  "glycemia.random": { state: "collected", surface: "structured_form" },
  "neuropathy.dpn_confirmed": { state: "collected", surface: "structured_form" },
  "neuropathy.painful_symptoms": { state: "collected", surface: "structured_form" },
  "neuropathy.atypical_features": { state: "collected", surface: "structured_form" },
  "medication_safety.maoi_exposure": {
    state: "not_collected",
    surface: "none",
    note: "MedicationSafetyContextV2 supports this fact, but the current Type 2 UI has no field for it.",
  },
  "medication_safety.substantial_alcohol_use": {
    state: "not_collected",
    surface: "none",
    note: "MedicationSafetyContextV2 supports this fact, but the current Type 2 UI has no field for it.",
  },
  "medication_safety.pregabalin_hypersensitivity": {
    state: "not_collected",
    surface: "none",
    note: "MedicationSafetyContextV2 supports this fact, but the current Type 2 UI has no field for it.",
  },
  "retinopathy.severity": { state: "collected", surface: "structured_form" },
  "retinopathy.dme": { state: "collected", surface: "structured_form" },
  "retinopathy.center_involving_dme": { state: "collected", surface: "structured_form" },
  "retinopathy.visual_acuity_context": { state: "collected", surface: "structured_form" },
  "diabetic_foot.ulcer": { state: "collected", surface: "structured_form" },
  "diabetic_foot.clinical_infection": { state: "collected", surface: "structured_form" },
  "diabetic_foot.infection_severity": { state: "collected", surface: "structured_form" },
  "diabetic_foot.pad": { state: "collected", surface: "structured_form" },
  "diabetic_foot.danger_features": { state: "collected", surface: "structured_form" },
  "diabetic_foot.osteomyelitis": { state: "collected", surface: "structured_form" },
  "nutrition.intent": { state: "collected", surface: "structured_form" },
  "nutrition.documented_deficiency": { state: "collected", surface: "structured_form" },
  "nutrition.deficiency_name": { state: "collected", surface: "structured_form" },
  "nutrition.objective_deficiency_data": { state: "collected", surface: "structured_form" },
  "nutrition.malnutrition_or_special_population": { state: "collected", surface: "structured_form" },
  "pregnancy.diabetes_type": { state: "collected", surface: "structured_form" },
  "pregnancy.glycemia": { state: "collected", surface: "structured_form" },
  "pregnancy.hypoglycemia_context": { state: "collected", surface: "structured_form" },
  "pregnancy.specialist_team": { state: "collected", surface: "structured_form" },
  "safety.product_specific_screen": {
    state: "not_represented",
    surface: "none",
    note: "The current request does not expose one complete, product-specific contraindication/interaction screen.",
  },
  "hypertension.established_treatment_context": {
    state: "not_represented",
    surface: "none",
    note: "A single encounter BP must not be promoted into an established hypertension-treatment context.",
  },
} as const satisfies Record<Type2ClinicalInputIdV2, Type2UiInputCoverageEntryV2>;

export const type2UiInputGapsV2 = (Object.entries(type2UiInputCoverageV2) as Array<
  [Type2ClinicalInputIdV2, Type2UiInputCoverageEntryV2]
>)
  .filter(([, entry]) => entry.state === "not_collected" || entry.state === "not_represented")
  .map(([id]) => id);
