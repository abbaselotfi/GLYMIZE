import type {
  ClinicalModuleLifecycleState,
  ClinicalModuleRegistration,
  LegacyClinicalModuleMaturity,
} from "@glymize/contracts/clinical-modules";

export const LEGACY_MODULE_MATURITY_MAP = {
  reviewed_cds: "reviewed_decision_support",
  reviewed_tool: "reviewed_decision_support",
  reference_only: "read_only_context",
} as const satisfies Record<LegacyClinicalModuleMaturity, ClinicalModuleLifecycleState>;

export type ClinicalModuleRegistryEntry = ClinicalModuleRegistration & {
  faTitle: string;
  enTitle: string;
  faDescription: string;
  enDescription: string;
};

export const CLINICAL_MODULE_REGISTRY: readonly ClinicalModuleRegistryEntry[] = [
  {
    id: "diabetes-type-2",
    kind: "clinical_module",
    route: "/type-2",
    legacyMaturity: "reviewed_cds",
    maturity: LEGACY_MODULE_MATURITY_MAP.reviewed_cds,
    treatmentAuthority: "type2_decision_graph_v2",
    releaseEligibility: "not_assessed",
    patientContextAdapter: "type2_patient_core_v1",
    requiredPatientInputs: ["current_hba1c"],
    optionalPatientInputs: [
      "egfr",
      "creatinine_clearance",
      "uacr",
      "potassium",
      "ascvd",
      "heart_failure",
      "ckd",
      "dialysis",
      "diabetic_foot",
      "masld_mash",
      "hypoglycemia_risk",
    ],
    faTitle: "دیابت نوع ۲",
    enTitle: "Type 2 Diabetes",
    faDescription: "Decision Graph v2 مرجع تصمیم فعلی است؛ Patient Core فقط context بازبینی‌شونده را پیشنهاد می‌کند.",
    enDescription: "Decision Graph v2 remains the decision authority; Patient Core only proposes reviewable context.",
  },
  {
    id: "insulin-conversion",
    kind: "clinical_tool",
    route: "/insulin-tools",
    legacyMaturity: "reviewed_tool",
    maturity: LEGACY_MODULE_MATURITY_MAP.reviewed_tool,
    treatmentAuthority: "none",
    releaseEligibility: "not_assessed",
    patientContextAdapter: "none",
    requiredPatientInputs: [],
    optionalPatientInputs: [],
    faTitle: "ابزار تبدیل انسولین",
    enTitle: "Insulin Conversion",
    faDescription: "ابزار بازبینی‌شدهٔ محاسباتی؛ ثبت در launcher به معنی treatment authority یا release eligibility نیست.",
    enDescription: "Reviewed calculation tool; launcher registration does not grant treatment authority or release eligibility.",
  },
  {
    id: "type-1",
    kind: "clinical_module",
    route: "/type-1",
    legacyMaturity: "reference_only",
    maturity: LEGACY_MODULE_MATURITY_MAP.reference_only,
    treatmentAuthority: "none",
    releaseEligibility: "not_assessed",
    patientContextAdapter: "none",
    requiredPatientInputs: [],
    optionalPatientInputs: [],
    faTitle: "دیابت نوع ۱",
    enTitle: "Type 1 Diabetes",
    faDescription: "ماژول read-only context؛ هیچ treatment authority یا مسیر درمان خودکار جدیدی ادعا نمی‌کند.",
    enDescription: "Read-only context module; it claims no treatment authority or new autonomous treatment pathway.",
  },
  {
    id: "pregnancy",
    kind: "cross_cutting_context",
    route: "/pregnancy",
    legacyMaturity: "reference_only",
    maturity: LEGACY_MODULE_MATURITY_MAP.reference_only,
    treatmentAuthority: "none",
    releaseEligibility: "not_assessed",
    patientContextAdapter: "none",
    requiredPatientInputs: [],
    optionalPatientInputs: [],
    faTitle: "دیابت و بارداری",
    enTitle: "Diabetes & Pregnancy",
    faDescription: "سطح read-only؛ pregnancy همچنان context میان‌دامنه‌ای است و module registration آن را diagnosis نمی‌کند.",
    enDescription: "Read-only surface; pregnancy remains cross-domain context and module registration does not diagnose it.",
  },
] as const;

export function clinicalModuleRegistration(moduleId: string) {
  return CLINICAL_MODULE_REGISTRY.find((entry) => entry.id === moduleId);
}

export function clinicalModuleMaturityLabel(
  maturity: ClinicalModuleLifecycleState,
  fa: boolean,
) {
  const labels: Record<ClinicalModuleLifecycleState, [string, string]> = {
    foundation: ["زیرساخت", "Foundation"],
    read_only_context: ["Context فقط‌خواندنی", "Read-only context"],
    pilot_decision_support: ["پایلوت پشتیبانی تصمیم", "Pilot decision support"],
    reviewed_decision_support: ["پشتیبانی تصمیم بازبینی‌شده", "Reviewed decision support"],
    release_eligible: ["واجد شرایط انتشار", "Release eligible"],
    deprecated: ["منسوخ", "Deprecated"],
  };
  return fa ? labels[maturity][0] : labels[maturity][1];
}
