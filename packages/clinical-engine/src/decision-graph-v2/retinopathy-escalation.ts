import type {
  DecisionGraphRequestV2,
  DecisionGraphResultV2,
  EvidenceReferenceV2,
  MissingDataRequirementV2,
} from "./types.js";

export type RetinopathySeverityV2 =
  | "none"
  | "mild_npdr"
  | "moderate_npdr"
  | "severe_npdr"
  | "pdr"
  | "unknown";

export interface RetinopathyContextV2 {
  /** Explicit clinician/screening result; never inferred from diabetes duration or glycemia. */
  diabeticRetinopathyPresent?: boolean;
  /** International clinical severity label supplied by the examining clinician/source. */
  severity?: RetinopathySeverityV2;
  /** Any diabetic macular edema (DME), independent of retinopathy severity. */
  diabeticMacularEdema?: boolean;
  /** Needed only to expose the ADA specialist-treatment evidence boundary for center-involving DME. */
  centerInvolvingDme?: boolean;
  /** Explicit visual-acuity impairment attributed to DME; never inferred from a generic vision complaint. */
  visualAcuityImpairmentAttributedToDme?: boolean;
  ophthalmologyCareEstablished?: boolean;
}

export type DecisionGraphRequestWithRetinopathyV2 = Omit<DecisionGraphRequestV2, "patient"> & {
  patient: DecisionGraphRequestV2["patient"] & { retinopathy?: RetinopathyContextV2 };
};

export interface SpecialistEscalationV2 {
  id: string;
  lane: "retinopathy";
  specialty: "ophthalmology";
  urgency: "prompt";
  triggers: string[];
  reason: string;
  treatmentEvidenceNotes: string[];
  evidence: EvidenceReferenceV2[];
  clinicianActionRequired: true;
  autonomousMedicationExecution: false;
}

export interface RetinopathyEscalationResolutionV2 {
  escalations: SpecialistEscalationV2[];
  missingData: MissingDataRequirementV2[];
}

export type DecisionGraphResultWithSpecialistEscalationsV2 = DecisionGraphResultV2 & {
  specialistEscalations: SpecialistEscalationV2[];
};

export const ada2026RetinopathyReferralEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA12-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 12: Retinopathy, Neuropathy, and Foot Care",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S261/163919/12-Retinopathy-Neuropathy-and-Foot-Care-Standards",
  locator: "Recommendation 12.9",
  strength: "guideline_grade_a",
};

export const ada2026RetinopathyTreatmentEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA12-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 12: Retinopathy, Neuropathy, and Foot Care",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S261/163919/12-Retinopathy-Neuropathy-and-Foot-Care-Standards",
  locator: "Recommendations 12.10-12.13",
  strength: "guideline_grade_a",
};

export const ada2026PregnancyRetinopathyEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA12-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 12: Retinopathy, Neuropathy, and Foot Care",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S261/163919/12-Retinopathy-Neuropathy-and-Foot-Care-Standards",
  locator: "Recommendations 12.7-12.8",
  strength: "guideline_grade_b",
};

function retinopathyContext(request: DecisionGraphRequestV2): RetinopathyContextV2 | undefined {
  return (request.patient as DecisionGraphRequestWithRetinopathyV2["patient"]).retinopathy;
}

function moderateOrWorse(severity: RetinopathySeverityV2 | undefined) {
  return severity === "moderate_npdr" || severity === "severe_npdr" || severity === "pdr";
}

function addMissing(
  result: MissingDataRequirementV2[],
  item: MissingDataRequirementV2,
) {
  if (!result.some((existing) => existing.key === item.key)) result.push(item);
}

/**
 * Specialist-only retinopathy pathway.
 *
 * ADA 2026 recommendation 12.9 is used verbatim as the execution boundary:
 * any DME, moderate-or-worse NPDR, or any PDR requires prompt ophthalmology
 * referral. Recommendations 12.10-12.13 are exposed only as specialist
 * treatment evidence. This resolver never creates an intravitreal drug, laser,
 * dose, product selection, or medication ranking authority.
 */
export function resolveRetinopathySpecialistEscalationV2(
  request: DecisionGraphRequestV2,
): RetinopathyEscalationResolutionV2 {
  const context = retinopathyContext(request);
  if (!context) return { escalations: [], missingData: [] };

  const missingData: MissingDataRequirementV2[] = [];
  const hasReferralTrigger = context.diabeticMacularEdema === true || moderateOrWorse(context.severity);

  if (
    context.diabeticRetinopathyPresent === true &&
    !hasReferralTrigger &&
    (context.severity === undefined || context.severity === "unknown") &&
    context.diabeticMacularEdema === undefined
  ) {
    addMissing(missingData, {
      key: "retinopathy.severityAndDme",
      priority: "recommended",
      blocksFinalDecision: false,
      reason: "رتینوپاتی گزارش شده است اما شدت DR و وضعیت DME برای تعیین مرز ارجاع سریع ADA 2026 مستند نشده‌اند.",
      evidence: [ada2026RetinopathyReferralEvidenceV2],
    });
  }

  if (context.diabeticMacularEdema === true && context.centerInvolvingDme === undefined) {
    addMissing(missingData, {
      key: "retinopathy.centerInvolvingDme",
      priority: "recommended",
      blocksFinalDecision: false,
      reason: "وجود DME برای ارجاع کافی است؛ درگیری مرکز ماکولا برای تفسیر evidence درمانی specialist باید مشخص شود.",
      evidence: [ada2026RetinopathyTreatmentEvidenceV2],
    });
  }

  if (
    context.diabeticMacularEdema === true &&
    context.centerInvolvingDme === true &&
    context.visualAcuityImpairmentAttributedToDme === undefined
  ) {
    addMissing(missingData, {
      key: "retinopathy.visualAcuityImpairmentAttributedToDme",
      priority: "recommended",
      blocksFinalDecision: false,
      reason: "برای نمایش دقیق مرز توصیه 12.12 باید مشخص باشد آیا DME مرکزگیر با افت حدت بینایی همراه است؛ این داده برای خود ارجاع blocking نیست.",
      evidence: [ada2026RetinopathyTreatmentEvidenceV2],
    });
  }

  if (!hasReferralTrigger) return { escalations: [], missingData };

  const triggers: string[] = [];
  if (context.diabeticMacularEdema === true) triggers.push("diabetic_macular_edema");
  if (context.severity === "moderate_npdr") triggers.push("moderate_npdr");
  if (context.severity === "severe_npdr") triggers.push("severe_npdr");
  if (context.severity === "pdr") triggers.push("pdr");

  const treatmentEvidenceNotes: string[] = [
    "این خروجی فقط ارجاع/تشدید مراقبت است؛ انتخاب laser، intravitreal anti-VEGF یا corticosteroid باید توسط چشم‌پزشک انجام شود و در این lane هیچ دارو یا دوزی به‌صورت خودکار ساخته نمی‌شود.",
  ];
  if (context.severity === "pdr") {
    treatmentEvidenceNotes.push(
      "برای PDR، ADA 2026 درمان‌های specialist از جمله panretinal photocoagulation و در برخی بیماران anti-VEGF را مطرح می‌کند؛ انتخاب modality خارج از اختیار موتور عمومی Type 2 است.",
    );
  }
  if (context.diabeticMacularEdema === true) {
    if (context.centerInvolvingDme === true && context.visualAcuityImpairmentAttributedToDme === true) {
      treatmentEvidenceNotes.push(
        "برای اکثر چشم‌های دارای DME مرکزگیر همراه افت حدت بینایی، ADA 2026 anti-VEGF داخل زجاجیه را درمان خط اول specialist می‌داند؛ GLYMIZE فقط evidence را نمایش می‌دهد.",
      );
    } else {
      treatmentEvidenceNotes.push(
        "DME نیازمند ارزیابی چشم‌پزشکی است؛ modality درمانی به درگیری مرکز ماکولا، حدت بینایی و ارزیابی specialist وابسته می‌ماند.",
      );
    }
  }
  if (request.patient.pregnancy === true) {
    treatmentEvidenceNotes.push(
      "بارداری نیازمند پایش چشمی pregnancy-aware است؛ هر تصمیم درباره درمان داخل چشمی باید با ارزیابی منفعت/خطر توسط specialist انجام شود.",
    );
  }

  const evidence = [ada2026RetinopathyReferralEvidenceV2, ada2026RetinopathyTreatmentEvidenceV2];
  if (request.patient.pregnancy === true) evidence.push(ada2026PregnancyRetinopathyEvidenceV2);

  return {
    escalations: [
      {
        id: "RETINOPATHY-ADA2026-PROMPT-OPHTHALMOLOGY",
        lane: "retinopathy",
        specialty: "ophthalmology",
        urgency: "prompt",
        triggers,
        reason: "ADA 2026 توصیه می‌کند در هر DME، NPDR متوسط یا شدید، یا هر PDR ارجاع سریع به چشم‌پزشک آشنا با مدیریت رتینوپاتی دیابتی انجام شود.",
        treatmentEvidenceNotes,
        evidence,
        clinicianActionRequired: true,
        autonomousMedicationExecution: false,
      },
    ],
    missingData,
  };
}
