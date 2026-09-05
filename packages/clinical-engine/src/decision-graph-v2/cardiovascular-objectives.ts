import type {
  ClinicalObjectiveV2,
  DecisionGraphRequestV2,
  EvidenceReferenceV2,
} from "./types.js";

/**
 * ADA 2026 Section 10 is the single authority for the Phase 4 blood-pressure
 * and lipid objective triggers below. These constants are intentionally named
 * and colocated so the engine does not grow another set of unexplained numeric
 * literals across objective, scoring, or product-dose code.
 */
export const ada2026CardiovascularRiskEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA10-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 10: Cardiovascular Disease and Risk Management",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S216/163933/10-Cardiovascular-Disease-and-Risk-Management",
  locator: "Recommendations 10.1, 10.6, 10.8, 10.10, and 10.18-10.28",
  strength: "guideline_grade_a",
};

export const ada2026CardiovascularObjectiveTriggersV2 = {
  hypertensionTreatmentSystolicAtOrAbove: 130,
  hypertensionTreatmentDiastolicAtOrAbove: 80,
  raasAlbuminuriaUacrAtOrAboveMgG: 30,
  raasReducedEgfrBelow: 60,
  statinPrimaryPreventionAgeAtOrAbove: 40,
  statinPrimaryPreventionAgeAtOrBelow: 75,
  statinYoungAdultConsiderationAgeAtOrAbove: 20,
} as const;

export function bloodPressureInAda2026TreatmentRangeV2(request: DecisionGraphRequestV2) {
  const cardiovascular = request.patient.cardiovascular;
  const systolic = cardiovascular?.systolicBloodPressure;
  const diastolic = cardiovascular?.diastolicBloodPressure;
  return (
    (typeof systolic === "number" &&
      systolic >= ada2026CardiovascularObjectiveTriggersV2.hypertensionTreatmentSystolicAtOrAbove) ||
    (typeof diastolic === "number" &&
      diastolic >= ada2026CardiovascularObjectiveTriggersV2.hypertensionTreatmentDiastolicAtOrAbove)
  );
}

export function hasTask6RaasIndicationV2(request: DecisionGraphRequestV2) {
  const kidney = request.patient.kidney;
  const cardiovascular = request.patient.cardiovascular;
  return (
    (typeof kidney?.uacrMgG === "number" &&
      kidney.uacrMgG >= ada2026CardiovascularObjectiveTriggersV2.raasAlbuminuriaUacrAtOrAboveMgG) ||
    (typeof kidney?.eGfr === "number" &&
      kidney.eGfr < ada2026CardiovascularObjectiveTriggersV2.raasReducedEgfrBelow) ||
    cardiovascular?.priorMi === true
  );
}

export function hasEstablishedHypertensionTreatmentContextV2(
  request: DecisionGraphRequestV2,
) {
  return (request.patient.currentMedications ?? []).some((medication) =>
    (medication.status ?? "active") === "active" &&
    [
      "raas_blocker",
      "antihypertensive",
      "mineralocorticoid_receptor_antagonist",
    ].includes(medication.therapyGroup ?? ""),
  );
}

function hasRepresentedAdditionalAscvdRiskFactor(request: DecisionGraphRequestV2) {
  return (
    request.patient.kidney?.ckd === true ||
    (request.patient.anthropometrics?.bmi ?? 0) >= 30 ||
    (
      bloodPressureInAda2026TreatmentRangeV2(request) &&
      hasEstablishedHypertensionTreatmentContextV2(request)
    )
  );
}

function bloodPressureObjective(request: DecisionGraphRequestV2): ClinicalObjectiveV2 | undefined {
  // ADA 2026 requires confirmation of hypertension rather than diagnosis from a
  // single reading. The current Decision Graph contract has BP values but no
  // explicit confirmation flag. Task 7 therefore fails closed for initiation:
  // an executable BP lane is activated only in an established antihypertensive
  // treatment context, while adaptive-data asks for confirmation otherwise.
  //
  // Task 6 deliberately contains ACEi/ARB but not the full general hypertension
  // formulary (e.g. thiazide-like diuretics / DHP CCBs), so an explicit RAAS
  // indication is also required before this limited catalogue can compose support.
  if (request.patient.pregnancy) return undefined;
  if (
    !bloodPressureInAda2026TreatmentRangeV2(request) ||
    !hasTask6RaasIndicationV2(request) ||
    !hasEstablishedHypertensionTreatmentContextV2(request)
  ) {
    return undefined;
  }

  const reasons: string[] = [];
  if ((request.patient.kidney?.uacrMgG ?? 0) >= ada2026CardiovascularObjectiveTriggersV2.raasAlbuminuriaUacrAtOrAboveMgG) {
    reasons.push("UACR ≥30 mg/g");
  }
  if (
    typeof request.patient.kidney?.eGfr === "number" &&
    request.patient.kidney.eGfr < ada2026CardiovascularObjectiveTriggersV2.raasReducedEgfrBelow
  ) {
    reasons.push("eGFR <60 mL/min/1.73 m²");
  }
  if (request.patient.cardiovascular?.priorMi) reasons.push("سابقه MI");

  return {
    id: "blood_pressure_control",
    lane: "hypertension",
    level: "mandatory",
    reason: `فشارخون در context درمانیِ فعال هنوز در محدوده نیازمند کنترل است و indication مشخص ACEi/ARB وجود دارد (${reasons.join("، ")}).`,
    evidence: [ada2026CardiovascularRiskEvidenceV2],
  };
}

function lipidObjective(request: DecisionGraphRequestV2): ClinicalObjectiveV2 | undefined {
  if (request.patient.pregnancy) return undefined;

  const age = request.patient.ageYears;
  if (request.patient.cardiovascular?.ascvd) {
    return {
      id: "lipid_risk_reduction",
      lane: "lipids",
      level: "mandatory",
      reason: "دیابت همراه ASCVD است؛ ADA 2026 درمان statin برای secondary prevention را مستقل از LDL پایه توصیه می‌کند.",
      evidence: [ada2026CardiovascularRiskEvidenceV2],
    };
  }

  if (
    typeof age === "number" &&
    age >= ada2026CardiovascularObjectiveTriggersV2.statinPrimaryPreventionAgeAtOrAbove &&
    age <= ada2026CardiovascularObjectiveTriggersV2.statinPrimaryPreventionAgeAtOrBelow
  ) {
    return {
      id: "lipid_risk_reduction",
      lane: "lipids",
      level: "mandatory",
      reason: "سن 40 تا 75 سال با دیابت، indication پایه ADA 2026 برای statin در primary prevention است.",
      evidence: [ada2026CardiovascularRiskEvidenceV2],
    };
  }

  if (typeof age === "number" && age > ada2026CardiovascularObjectiveTriggersV2.statinPrimaryPreventionAgeAtOrBelow) {
    return {
      id: "lipid_risk_reduction",
      lane: "lipids",
      level: "preference",
      reason: "سن بالاتر از 75 سال است؛ شروع statin در ADA 2026 نیازمند گفت‌وگوی فردی درباره سود و ریسک است و به‌صورت support اجباری ساخته نمی‌شود.",
      evidence: [ada2026CardiovascularRiskEvidenceV2],
    };
  }

  if (
    typeof age === "number" &&
    age >= ada2026CardiovascularObjectiveTriggersV2.statinYoungAdultConsiderationAgeAtOrAbove &&
    age < ada2026CardiovascularObjectiveTriggersV2.statinPrimaryPreventionAgeAtOrAbove &&
    hasRepresentedAdditionalAscvdRiskFactor(request)
  ) {
    return {
      id: "lipid_risk_reduction",
      lane: "lipids",
      level: "preference",
      reason: "سن 20 تا 39 سال همراه یک ریسک ASCVD قابل‌نمایش در داده‌های فعلی است؛ ADA 2026 بررسی فردی statin را معقول می‌داند.",
      evidence: [ada2026CardiovascularRiskEvidenceV2],
    };
  }

  return undefined;
}

export function resolveCardiovascularRiskObjectivesV2(
  request: DecisionGraphRequestV2,
): ClinicalObjectiveV2[] {
  const objectives = [bloodPressureObjective(request), lipidObjective(request)];
  return objectives.filter((item): item is ClinicalObjectiveV2 => Boolean(item));
}
