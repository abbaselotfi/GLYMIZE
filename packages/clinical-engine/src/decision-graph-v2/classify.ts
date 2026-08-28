import type {
  ClinicalStateV2,
  DecisionGraphPolicyV2,
  InsulinActionV2,
  PatientContextV2,
} from "./types.js";

function activeMedications(patient: PatientContextV2) {
  return (patient.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active");
}

function isBasalInsulin(item: { therapyGroup?: string; genericName: string }) {
  const text = `${item.therapyGroup ?? ""} ${item.genericName}`.toLocaleLowerCase();
  return /basal_insulin|glargine|degludec|detemir|nph/.test(text);
}

function isGlp1Based(item: { therapyGroup?: string; genericName: string }) {
  const text = `${item.therapyGroup ?? ""} ${item.genericName}`.toLocaleLowerCase();
  return /glp|tirzepatide|semaglutide|liraglutide|dulaglutide|lixisenatide|exenatide/.test(text);
}

function maxObservedGlucose(patient: PatientContextV2) {
  const values: number[] = [];
  const add = (value: number | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  };
  add(patient.glycemia.fastingPlasmaGlucoseMgDl);
  add(patient.glycemia.twoHourPostprandialGlucoseMgDl);
  add(patient.glycemia.randomGlucoseMgDl);
  for (const value of patient.glycemia.smbg?.fastingMgDl ?? []) add(value);
  for (const value of patient.glycemia.smbg?.premealMgDl ?? []) add(value);
  for (const value of patient.glycemia.smbg?.twoHourPostmealMgDl ?? []) add(value);
  for (const value of patient.glycemia.smbg?.bedtimeMgDl ?? []) add(value);
  return values.length ? Math.max(...values) : undefined;
}

function hasPostprandialEvidence(patient: PatientContextV2, policy: DecisionGraphPolicyV2) {
  if ((patient.glycemia.twoHourPostprandialGlucoseMgDl ?? 0) > policy.postprandialTargetUpperMgDl) return true;
  if ((patient.glycemia.smbg?.twoHourPostmealMgDl ?? []).some((value) => value > policy.postprandialTargetUpperMgDl)) return true;
  if ((patient.glycemia.cgm?.timeAbove180Percent ?? 0) > 0 && (patient.glycemia.cgm?.timeInRange70To180Percent ?? 100) < 70) return true;
  return false;
}

export function classifyClinicalStateV2(
  patient: PatientContextV2,
  policy: DecisionGraphPolicyV2,
): ClinicalStateV2 {
  const hba1cGap = Math.round((patient.glycemia.currentHba1c - patient.glycemia.targetHba1c) * 10) / 10;
  const maxGlucose = maxObservedGlucose(patient);
  const severeHyperglycemia = Boolean(
    patient.glycemia.hyperglycemiaSymptoms ||
    patient.glycemia.catabolicFeatures ||
    patient.glycemia.ketonesKnownPositive ||
    patient.glycemia.currentHba1c > policy.severeHyperglycemiaA1cExclusiveAbove ||
    (maxGlucose !== undefined && maxGlucose >= policy.severeHyperglycemiaGlucoseAtOrAboveMgDl),
  );

  const fasting = patient.glycemia.fastingPlasmaGlucoseMgDl;
  const fastingAtTarget = fasting === undefined
    ? undefined
    : fasting >= policy.fastingTargetLowMgDl && fasting <= policy.fastingTargetHighMgDl;
  const postprandialAboveTarget = hasPostprandialEvidence(patient, policy);
  const active = activeMedications(patient);
  const basal = active.find(isBasalInsulin);
  const glp1 = active.some(isGlp1Based);

  let pathway: ClinicalStateV2["pathway"];
  if (severeHyperglycemia) pathway = "insulin_centered";
  else if (hba1cGap >= policy.combinationTherapyA1cGapAtOrAbove) pathway = "high_efficacy_combination";
  else if (hba1cGap > 0) pathway = "modest_intensification";
  else pathway = "maintain_and_monitor";

  let insulinAction: InsulinActionV2 = "none";
  if (severeHyperglycemia && !basal) {
    insulinAction = "evaluate_start_basal";
  } else if (basal) {
    if (fastingAtTarget === false) {
      insulinAction = "titrate_basal";
    } else if (fastingAtTarget === true && hba1cGap > 0) {
      if (!postprandialAboveTarget) insulinAction = "request_postprandial_pattern";
      else if (!glp1) insulinAction = "consider_glp1_or_frc_before_prandial";
      else if (patient.insulinPractical?.multipleDailyInjectionFeasible === false && patient.insulinPractical?.mealPatternRegularity === "regular") {
        insulinAction = "consider_premix";
      } else {
        insulinAction = "add_prandial";
      }
    }
  }

  const reasons: string[] = [
    `A1C فعلی ${patient.glycemia.currentHba1c.toFixed(1)}%، هدف ${patient.glycemia.targetHba1c.toFixed(1)}% و فاصله ${hba1cGap.toFixed(1)} واحد درصد است.`,
  ];
  if (severeHyperglycemia) {
    reasons.push(`معیار بررسی انسولین فعال است: علائم/کاتابولیسم/کتون، A1C > ${policy.severeHyperglycemiaA1cExclusiveAbove}% یا گلوکز ≥ ${policy.severeHyperglycemiaGlucoseAtOrAboveMgDl} mg/dL.`);
  }
  if (basal && fastingAtTarget === true && hba1cGap > 0) {
    reasons.push("با وجود رسیدن FPG به هدف، A1C بالاتر از هدف است؛ سهم هایپرگلیسمی پس از غذا/overbasalization باید بررسی شود.");
  }

  return {
    pathway,
    insulinAction,
    severeHyperglycemia,
    hba1cGap,
    fastingAtTarget,
    postprandialAboveTarget,
    reasons,
    evidence: [policy.evidence.pharmacologic, policy.evidence.glycemicGoals],
  };
}
