import { finiteNonNegativeClinicalNumberV2 } from "./predicates.js";
import type {
  ClinicalObjectiveV2,
  DecisionGraphRequestV2,
  EvidenceReferenceV2,
} from "./types.js";

/**
 * ADA 2026 Section 10 is the single authority for the Phase 4 blood-pressure
 * and lipid objective triggers below. These constants are intentionally named
 * and colocated so the engine does not grow another set of unexplained numeric
 * literals across objective, ranking, or product-dose code.
 */
export const ada2026CardiovascularRiskEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA10-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 10: Cardiovascular Disease and Risk Management",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S216/163933/10-Cardiovascular-Disease-and-Risk-Management",
  locator: "Recommendations 10.1, 10.6, 10.8, 10.10, and 10.18-10.28; Table 10.1",
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
  const systolic = finiteNonNegativeClinicalNumberV2(cardiovascular?.systolicBloodPressure);
  const diastolic = finiteNonNegativeClinicalNumberV2(cardiovascular?.diastolicBloodPressure);
  return (
    (systolic !== undefined &&
      systolic >= ada2026CardiovascularObjectiveTriggersV2.hypertensionTreatmentSystolicAtOrAbove) ||
    (diastolic !== undefined &&
      diastolic >= ada2026CardiovascularObjectiveTriggersV2.hypertensionTreatmentDiastolicAtOrAbove)
  );
}

export function hasTask6RaasIndicationV2(request: DecisionGraphRequestV2) {
  const kidney = request.patient.kidney;
  const cardiovascular = request.patient.cardiovascular;
  const uacrMgG = finiteNonNegativeClinicalNumberV2(kidney?.uacrMgG);
  const eGfr = finiteNonNegativeClinicalNumberV2(kidney?.eGfr);
  return (
    (uacrMgG !== undefined &&
      uacrMgG >= ada2026CardiovascularObjectiveTriggersV2.raasAlbuminuriaUacrAtOrAboveMgG) ||
    (eGfr !== undefined &&
      eGfr < ada2026CardiovascularObjectiveTriggersV2.raasReducedEgfrBelow) ||
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
  const bmi = finiteNonNegativeClinicalNumberV2(request.patient.anthropometrics?.bmi);
  return (
    request.patient.kidney?.ckd === true ||
    (bmi !== undefined && bmi >= 30) ||
    (
      bloodPressureInAda2026TreatmentRangeV2(request) &&
      hasEstablishedHypertensionTreatmentContextV2(request)
    )
  );
}

function bloodPressureObjective(request: DecisionGraphRequestV2): ClinicalObjectiveV2 | undefined {
  // ADA 2026 requires confirmed hypertension; a single encounter BP must not be
  // promoted into a diagnosis. Until a dedicated diagnosis/confirmation field is
  // part of the longitudinal record contract, Task 7 fails closed for initiation:
  // an executable BP lane requires an established antihypertensive treatment
  // context plus a Task 6 RAAS indication. Otherwise adaptive-data asks for
  // confirmation rather than authoring a new prescription from one reading.
  if (request.patient.pregnancy) return undefined;
  if (
    !bloodPressureInAda2026TreatmentRangeV2(request) ||
    !hasTask6RaasIndicationV2(request) ||
    !hasEstablishedHypertensionTreatmentContextV2(request)
  ) {
    return undefined;
  }

  const reasons: string[] = [];
  const uacrMgG = finiteNonNegativeClinicalNumberV2(request.patient.kidney?.uacrMgG);
  const eGfr = finiteNonNegativeClinicalNumberV2(request.patient.kidney?.eGfr);
  if (
    uacrMgG !== undefined &&
    uacrMgG >= ada2026CardiovascularObjectiveTriggersV2.raasAlbuminuriaUacrAtOrAboveMgG
  ) {
    reasons.push("UACR ≥30 mg/g");
  }
  if (
    eGfr !== undefined &&
    eGfr < ada2026CardiovascularObjectiveTriggersV2.raasReducedEgfrBelow
  ) {
    reasons.push("eGFR <60 mL/min/1.73 m²");
  }
  if (request.patient.cardiovascular?.priorMi) reasons.push("prior MI/CAD context");

  return {
    id: "blood_pressure_control",
    lane: "hypertension",
    level: "mandatory",
    reason: `Established hypertension treatment context remains above the ADA treatment threshold and a Task 6 ACEi/ARB indication is represented (${reasons.join(", ")}).`,
    evidence: [ada2026CardiovascularRiskEvidenceV2],
  };
}

function lipidObjective(request: DecisionGraphRequestV2): ClinicalObjectiveV2 | undefined {
  if (request.patient.pregnancy) return undefined;

  const age = finiteNonNegativeClinicalNumberV2(request.patient.ageYears);
  if (request.patient.cardiovascular?.ascvd) {
    return {
      id: "lipid_risk_reduction",
      lane: "lipids",
      level: "mandatory",
      reason: "Diabetes with established ASCVD requires statin-based secondary prevention; exact intensity/dose remains governed by reviewed product-dose execution and clinician confirmation.",
      evidence: [ada2026CardiovascularRiskEvidenceV2],
    };
  }

  if (
    age !== undefined &&
    age >= ada2026CardiovascularObjectiveTriggersV2.statinPrimaryPreventionAgeAtOrAbove &&
    age <= ada2026CardiovascularObjectiveTriggersV2.statinPrimaryPreventionAgeAtOrBelow
  ) {
    return {
      id: "lipid_risk_reduction",
      lane: "lipids",
      level: "mandatory",
      reason: "Age 40–75 years with diabetes is the ADA 2026 baseline indication for statin primary prevention, independent of a baseline LDL trigger.",
      evidence: [ada2026CardiovascularRiskEvidenceV2],
    };
  }

  if (age !== undefined && age > ada2026CardiovascularObjectiveTriggersV2.statinPrimaryPreventionAgeAtOrBelow) {
    return {
      id: "lipid_risk_reduction",
      lane: "lipids",
      level: "preference",
      reason: "For statin initiation after age 75, ADA 2026 calls for individualized benefit-risk discussion; Task 7 does not create mandatory executable support.",
      evidence: [ada2026CardiovascularRiskEvidenceV2],
    };
  }

  if (
    age !== undefined &&
    age >= ada2026CardiovascularObjectiveTriggersV2.statinYoungAdultConsiderationAgeAtOrAbove &&
    age < ada2026CardiovascularObjectiveTriggersV2.statinPrimaryPreventionAgeAtOrAbove &&
    hasRepresentedAdditionalAscvdRiskFactor(request)
  ) {
    return {
      id: "lipid_risk_reduction",
      lane: "lipids",
      level: "preference",
      reason: "Age 20–39 years with an additional represented ASCVD risk factor supports individualized statin consideration rather than mandatory support.",
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
