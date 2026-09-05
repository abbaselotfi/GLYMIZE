import type {
  DecisionGraphRequestV2,
  EvidenceReferenceV2,
  MissingDataRequirementV2,
} from "./types.js";

export type DiabeticFootInfectionSeverityV2 = "mild" | "moderate" | "severe" | "unknown";

export interface DiabeticFootContextV2 {
  /** Explicit ulcer/wound presence from clinician/source; never inferred from a generic diabetic-foot flag. */
  footUlcerPresent?: boolean;
  /** Clinical infection diagnosis based on local/systemic inflammatory signs. */
  clinicalInfectionPresent?: boolean;
  /** IWGDF/IDSA infection severity; meaningful only when clinicalInfectionPresent=true. */
  infectionSeverity?: DiabeticFootInfectionSeverityV2;
  peripheralArteryDisease?: boolean;
  extensiveGangrene?: boolean;
  necrotisingInfection?: boolean;
  deepAbscessSuspected?: boolean;
  compartmentSyndrome?: boolean;
  severeLowerLimbIschaemia?: boolean;
  osteomyelitisSuspected?: boolean;
  exposedBone?: boolean;
}

export type DecisionGraphRequestWithDiabeticFootV2 = Omit<DecisionGraphRequestV2, "patient"> & {
  patient: DecisionGraphRequestV2["patient"] & { diabeticFoot?: DiabeticFootContextV2 };
};

export type DiabeticFootPathwayStateV2 =
  | "no_foot_ulcer_context"
  | "needs_infection_assessment"
  | "uninfected_ulcer"
  | "infected_mild"
  | "infected_moderate"
  | "infected_severe"
  | "infected_needs_severity";

export interface DiabeticFootEscalationV2 {
  id: string;
  urgency: "routine" | "prompt" | "urgent";
  destinations: Array<"diabetic_foot_team" | "surgical" | "vascular" | "hospital">;
  reason: string;
  evidence: EvidenceReferenceV2[];
}

export interface DiabeticFootPathwayResolutionV2 {
  state: DiabeticFootPathwayStateV2;
  antibioticExecution: false;
  antibioticBoundary:
    | "not_indicated_for_uninfected_ulcer"
    | "requires_severity_pathogen_patient_and_local_protocol_review"
    | "not_assessed";
  actions: string[];
  escalations: DiabeticFootEscalationV2[];
  missingData: MissingDataRequirementV2[];
  evidence: EvidenceReferenceV2[];
}

export const iwgdfIdsa2023DiagnosisEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "IWGDF-IDSA-DFI-2023",
  title: "IWGDF/IDSA Guidelines on the Diagnosis and Treatment of Diabetes-related Foot Infections",
  version: "2023",
  url: "https://www.idsociety.org/practice-guideline/diabetic-foot-infections/",
  locator: "Recommendations 1-10",
  strength: "guideline_grade_a",
};

export const iwgdfIdsa2023NoAntibioticEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "IWGDF-IDSA-DFI-2023",
  title: "IWGDF/IDSA Guidelines on the Diagnosis and Treatment of Diabetes-related Foot Infections",
  version: "2023",
  url: "https://www.idsociety.org/practice-guideline/diabetic-foot-infections/",
  locator: "Recommendation 11",
  strength: "guideline_grade_a",
};

export const iwgdfIdsa2023TreatmentSelectionEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "IWGDF-IDSA-DFI-2023",
  title: "IWGDF/IDSA Guidelines on the Diagnosis and Treatment of Diabetes-related Foot Infections",
  version: "2023",
  url: "https://www.idsociety.org/practice-guideline/diabetic-foot-infections/",
  locator: "Recommendations 12-16",
  strength: "guideline_grade_a",
};

export const iwgdfIdsa2023SurgicalEscalationEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "IWGDF-IDSA-DFI-2023",
  title: "IWGDF/IDSA Guidelines on the Diagnosis and Treatment of Diabetes-related Foot Infections",
  version: "2023",
  url: "https://www.idsociety.org/practice-guideline/diabetic-foot-infections/",
  locator: "Recommendations 18-22",
  strength: "guideline_grade_a",
};

function footContext(request: DecisionGraphRequestV2): DiabeticFootContextV2 | undefined {
  return (request.patient as DecisionGraphRequestWithDiabeticFootV2["patient"]).diabeticFoot;
}

function addMissing(result: MissingDataRequirementV2[], item: MissingDataRequirementV2) {
  if (!result.some((existing) => existing.key === item.key)) result.push(item);
}

function uniqueEscalations(values: DiabeticFootEscalationV2[]) {
  const byId = new Map<string, DiabeticFootEscalationV2>();
  for (const value of values) byId.set(value.id, value);
  return [...byId.values()];
}

/**
 * Diabetic-foot safety/escalation pathway.
 *
 * This module intentionally stops before antimicrobial selection. It establishes
 * infection/severity, source-control and referral boundaries, while preserving
 * Recommendation 11: a clinically uninfected ulcer must not receive antibiotic
 * therapy merely to prevent infection or promote healing.
 */
export function resolveDiabeticFootPathwayV2(
  request: DecisionGraphRequestV2,
): DiabeticFootPathwayResolutionV2 {
  const context = footContext(request);
  if (!context || context.footUlcerPresent !== true) {
    return {
      state: "no_foot_ulcer_context",
      antibioticExecution: false,
      antibioticBoundary: "not_assessed",
      actions: [],
      escalations: [],
      missingData: [],
      evidence: [iwgdfIdsa2023DiagnosisEvidenceV2],
    };
  }

  const missingData: MissingDataRequirementV2[] = [];
  const actions: string[] = [];
  const escalations: DiabeticFootEscalationV2[] = [];

  if (context.clinicalInfectionPresent === undefined) {
    addMissing(missingData, {
      key: "diabeticFoot.clinicalInfectionPresent",
      priority: "required",
      blocksFinalDecision: false,
      reason: "وجود عفونت پای دیابتی باید بر اساس علائم و نشانه‌های بالینی التهاب مشخص شود؛ صرف وجود زخم یا کشت مثبت معادل عفونت نیست.",
      evidence: [iwgdfIdsa2023DiagnosisEvidenceV2],
    });
    return {
      state: "needs_infection_assessment",
      antibioticExecution: false,
      antibioticBoundary: "not_assessed",
      actions: ["ابتدا وجود یا عدم وجود عفونت را به‌صورت بالینی تعیین کنید؛ آنتی‌بیوتیک تا قبل از این مرحله انتخاب نمی‌شود."],
      escalations: [],
      missingData,
      evidence: [iwgdfIdsa2023DiagnosisEvidenceV2, iwgdfIdsa2023NoAntibioticEvidenceV2],
    };
  }

  if (context.clinicalInfectionPresent === false) {
    actions.push(
      "زخم از نظر بالینی عفونی نیست؛ آنتی‌بیوتیک سیستمیک یا موضعی صرفاً برای پیشگیری از عفونت یا تسریع ترمیم توصیه نمی‌شود.",
      "مراقبت زخم، off-loading، ارزیابی عروقی و کنترل متابولیک باید مستقل از antibiotic therapy انجام شود.",
    );
    return {
      state: "uninfected_ulcer",
      antibioticExecution: false,
      antibioticBoundary: "not_indicated_for_uninfected_ulcer",
      actions,
      escalations,
      missingData,
      evidence: [iwgdfIdsa2023NoAntibioticEvidenceV2],
    };
  }

  const severity = context.infectionSeverity;
  if (!severity || severity === "unknown") {
    addMissing(missingData, {
      key: "diabeticFoot.infectionSeverity",
      priority: "required",
      blocksFinalDecision: false,
      reason: "پس از تشخیص عفونت، severity باید با طبقه‌بندی IWGDF/IDSA مشخص شود؛ بدون severity مسیر بستری/جراحی و antimicrobial review تعیین نمی‌شود.",
      evidence: [iwgdfIdsa2023DiagnosisEvidenceV2],
    });
  }

  const urgentSurgicalTrigger =
    severity === "severe" ||
    (severity === "moderate" &&
      (context.extensiveGangrene === true ||
        context.necrotisingInfection === true ||
        context.deepAbscessSuspected === true ||
        context.compartmentSyndrome === true ||
        context.severeLowerLimbIschaemia === true));

  if (severity === "severe") {
    escalations.push({
      id: "DFI-SEVERE-HOSPITAL-CONSIDERATION",
      urgency: "urgent",
      destinations: ["hospital", "diabetic_foot_team"],
      reason: "عفونت severe طبق IWGDF/IDSA نیازمند consideration برای بستری و ارزیابی تیم چندتخصصی است.",
      evidence: [iwgdfIdsa2023DiagnosisEvidenceV2],
    });
  } else if (severity === "moderate" && context.peripheralArteryDisease === true) {
    escalations.push({
      id: "DFI-MODERATE-PAD-HOSPITAL-CONSIDERATION",
      urgency: "prompt",
      destinations: ["hospital", "diabetic_foot_team"],
      reason: "عفونت moderate همراه PAD یک morbidity مهم است و باید برای بستری/مدیریت نزدیک‌تر ارزیابی شود.",
      evidence: [iwgdfIdsa2023DiagnosisEvidenceV2],
    });
  }

  if (urgentSurgicalTrigger) {
    escalations.push({
      id: "DFI-URGENT-SURGICAL-CONSULT",
      urgency: "urgent",
      destinations: ["surgical", "diabetic_foot_team"],
      reason: "severe DFI یا moderate DFI همراه gangrene گسترده، necrotising infection، deep abscess، compartment syndrome یا ایسکمی شدید نیازمند مشاوره فوری جراحی است.",
      evidence: [iwgdfIdsa2023SurgicalEscalationEvidenceV2],
    });
  }

  if (
    context.peripheralArteryDisease === true &&
    (context.footUlcerPresent === true || context.extensiveGangrene === true)
  ) {
    escalations.push({
      id: "DFI-PAD-SURGICAL-VASCULAR-CONSULT",
      urgency: "urgent",
      destinations: ["surgical", "vascular"],
      reason: "عفونت پا همراه PAD و ulcer/gangrene نیازمند مشاوره فوری جراحی و عروق برای drainage و/یا revascularisation است.",
      evidence: [iwgdfIdsa2023SurgicalEscalationEvidenceV2],
    });
  }

  if (severity === "moderate" || severity === "severe") {
    actions.push(
      "source control را هم‌زمان ارزیابی کنید؛ IWGDF/IDSA برای moderate/severe DFI، جراحی زودهنگام طی 24–48 ساعت همراه با درمان عفونت را در موارد مناسب مطرح می‌کند.",
    );
  }

  if (context.osteomyelitisSuspected === true) {
    actions.push(
      "برای suspicion به osteomyelitis، probe-to-bone، plain X-ray و ESR/CRP/PCT را به‌عنوان بررسی اولیه در نظر بگیرید؛ اگر تشخیص همچنان نامشخص است MRI توصیه می‌شود.",
    );
  }

  actions.push(
    "انتخاب antimicrobial در این موتور خودکار نیست؛ باید pathogen محتمل/اثبات‌شده و susceptibility، severity، adverse effects/interactions، عملکرد کلیه، availability/cost و پروتکل محلی مرور شوند.",
  );

  const state: DiabeticFootPathwayStateV2 =
    severity === "mild"
      ? "infected_mild"
      : severity === "moderate"
        ? "infected_moderate"
        : severity === "severe"
          ? "infected_severe"
          : "infected_needs_severity";

  return {
    state,
    antibioticExecution: false,
    antibioticBoundary: "requires_severity_pathogen_patient_and_local_protocol_review",
    actions,
    escalations: uniqueEscalations(escalations),
    missingData,
    evidence: [
      iwgdfIdsa2023DiagnosisEvidenceV2,
      iwgdfIdsa2023TreatmentSelectionEvidenceV2,
      iwgdfIdsa2023SurgicalEscalationEvidenceV2,
    ],
  };
}
