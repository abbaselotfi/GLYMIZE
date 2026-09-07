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
 * Explicit coverage map for the active clinician-facing `/type-2` route rendered
 * by Type2ExperienceFrame -> Type2ScenariosClient.
 *
 * This is drift metadata only. It does not populate request values and must not
 * be used to infer missing clinical facts. Legacy/inactive Type 2 clients do not
 * define coverage for this map. `not_collected` and `not_represented` inputs
 * remain absent/fail-closed at runtime.
 */
export const type2UiInputCoverageV2 = {
  "core.current_hba1c": { state: "collected", surface: "core_form" },
  "core.target_hba1c": { state: "collected", surface: "core_form" },
  "core.current_medications": { state: "collected", surface: "core_form" },
  "current_medication.interval_stage_reconciliation": {
    state: "collected",
    surface: "core_form",
    note: "The active current-medication row collects explicit administration interval, days on current dose, therapy phase, next-administration timing, and total duration; partial interval data stays partial and these facts are never inferred from medicine identity, dose, or frequency.",
  },
  "core.age_years": {
    state: "not_collected",
    surface: "none",
    note: "The request contract supports ageYears, but the active Type 2 clinician form does not collect it; longitudinal demographic design should prefer date of birth rather than adding a static patient age here.",
  },
  "core.pregnancy": {
    state: "derived",
    surface: "core_form",
    note: "The active form's explicit pregnancy decision factor is deterministically projected to clinicalContext.pregnancy; the runtime adapter fallback remains compatibility protection rather than the primary UI source.",
  },
  "core.hyperglycemia_symptoms": { state: "collected", surface: "core_form" },
  "core.catabolic_features": { state: "collected", surface: "core_form" },
  "cardiovascular.ascvd": { state: "collected", surface: "core_form" },
  "cardiovascular.heart_failure": { state: "collected", surface: "core_form" },
  "cardiovascular.lvef_percent": { state: "collected", surface: "core_form" },
  "cardiovascular.nyha_class": {
    state: "not_collected",
    surface: "none",
    note: "The active Type 2 scenario form does not currently collect NYHA functional class.",
  },
  "cardiovascular.systolic_bp": {
    state: "not_collected",
    surface: "none",
    note: "The active Type 2 scenario form does not currently collect systolic blood pressure.",
  },
  "cardiovascular.diastolic_bp": {
    state: "not_collected",
    surface: "none",
    note: "The active Type 2 scenario form does not currently collect diastolic blood pressure.",
  },
  "kidney.ckd": { state: "collected", surface: "core_form" },
  "kidney.egfr": { state: "collected", surface: "core_form" },
  "kidney.creatinine_clearance": {
    state: "collected",
    surface: "core_form",
    note: "The active CKD panel collects explicit CrCl and can import confirmed handoff CrCl; it is never inferred from eGFR. Visibility is currently conditional on the CKD factor.",
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
    note: "MedicationSafetyContextV2 supports this fact, but the active Type 2 UI has no field for it.",
  },
  "medication_safety.substantial_alcohol_use": {
    state: "not_collected",
    surface: "none",
    note: "MedicationSafetyContextV2 supports this fact, but the active Type 2 UI has no field for it.",
  },
  "medication_safety.pregabalin_hypersensitivity": {
    state: "not_collected",
    surface: "none",
    note: "MedicationSafetyContextV2 supports this fact, but the active Type 2 UI has no field for it.",
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
