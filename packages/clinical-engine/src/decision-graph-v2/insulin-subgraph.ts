import type {
  ClinicalStateV2,
  DecisionGraphPolicyV2,
  EvidenceReferenceV2,
  PatientContextV2,
} from "./types.js";
import { ada2026InsulinEvidenceV2 } from "./insulin-rules.js";

export type InsulinSubgraphStatusV2 =
  | "not_active"
  | "needs_data"
  | "urgent_review"
  | "start_basal"
  | "titrate_basal"
  | "consider_glp1_or_frc"
  | "add_prandial"
  | "consider_premix"
  | "maintain_current_insulin";

export interface InsulinSubgraphNodeV2 {
  id: string;
  status: "passed" | "active" | "needs_data" | "blocked";
  summary: string;
  evidence: EvidenceReferenceV2[];
}

export interface OverbasalizationAssessmentV2 {
  suspected: boolean;
  bedtimeMorningDifferentialMgDl?: number;
  cgmCoefficientOfVariationPercent?: number;
  hypoglycemiaSignal: boolean;
  reasons: string[];
}

export interface InsulinSubgraphResultV2 {
  status: InsulinSubgraphStatusV2;
  action: ClinicalStateV2["insulinAction"];
  requiresInsulinTool: boolean;
  requiredInputs: string[];
  recommendedOptionalInputs: string[];
  overbasalization: OverbasalizationAssessmentV2;
  rationale: string[];
  nodes: InsulinSubgraphNodeV2[];
  evidence: EvidenceReferenceV2[];
}

function activeMedications(patient: PatientContextV2) {
  return (patient.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active");
}

function currentBasal(patient: PatientContextV2) {
  return activeMedications(patient).find((item) => {
    const text = `${item.therapyGroup ?? ""} ${item.genericName}`.toLowerCase();
    return /basal_insulin|glargine|degludec|detemir|\bnph\b/.test(text);
  });
}

function currentGlp1Based(patient: PatientContextV2) {
  return activeMedications(patient).some((item) => {
    const text = `${item.therapyGroup ?? ""} ${item.genericName}`.toLowerCase();
    return /glp|tirzepatide|semaglutide|liraglutide|dulaglutide|lixisenatide|exenatide|fixed_ratio_combination/.test(text);
  });
}

function median(values: readonly number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function bedtimeMorningDifferential(patient: PatientContextV2) {
  const bedtime = patient.glycemia.smbg?.bedtimeMgDl ?? [];
  const fasting = patient.glycemia.smbg?.fastingMgDl ?? [];
  const count = Math.min(bedtime.length, fasting.length);
  if (!count) return undefined;
  const deltas: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const b = bedtime[bedtime.length - count + i];
    const f = fasting[fasting.length - count + i];
    if (typeof b === "number" && typeof f === "number") deltas.push(b - f);
  }
  return median(deltas);
}

export function assessOverbasalizationV2(patient: PatientContextV2, policy: DecisionGraphPolicyV2): OverbasalizationAssessmentV2 {
  const reasons: string[] = [];
  const differential = bedtimeMorningDifferential(patient);
  const cv = patient.glycemia.cgm?.coefficientOfVariationPercent;
  const tbr70 = patient.glycemia.cgm?.timeBelow70Percent;
  const tbr54 = patient.glycemia.cgm?.timeBelow54Percent;
  const hypoglycemiaSignal = patient.hypoglycemiaRisk === "high" || (tbr70 ?? 0) > 4 || (tbr54 ?? 0) >= 1;

  if (differential !== undefined && differential >= policy.overbasalizationBedtimeMorningDeltaMgDl) {
    reasons.push(`Bedtime-to-morning glucose differential is ${Math.round(differential)} mg/dL, meeting the Decision Graph overbasalization signal threshold.`);
  }
  if (hypoglycemiaSignal) reasons.push("Hypoglycemia exposure/risk is present while basal insulin is being evaluated.");
  if (cv !== undefined && cv > 36) reasons.push(`CGM coefficient of variation is ${cv}%, indicating high glycemic variability.`);

  return {
    suspected: reasons.length > 0,
    bedtimeMorningDifferentialMgDl: differential,
    cgmCoefficientOfVariationPercent: cv,
    hypoglycemiaSignal,
    reasons,
  };
}

export function runInsulinDecisionSubgraphV2(
  patient: PatientContextV2,
  state: ClinicalStateV2,
  policy: DecisionGraphPolicyV2,
): InsulinSubgraphResultV2 {
  const nodes: InsulinSubgraphNodeV2[] = [];
  const rationale: string[] = [];
  const requiredInputs: string[] = [];
  const recommendedOptionalInputs: string[] = [];
  const basal = currentBasal(patient);
  const glp1 = currentGlp1Based(patient);
  const overbasalization = assessOverbasalizationV2(patient, policy);

  nodes.push({ id: "insulin-entry", status: state.pathway === "insulin_centered" || Boolean(basal) ? "active" : "passed", summary: `pathway=${state.pathway}; currentBasal=${Boolean(basal)}`, evidence: [ada2026InsulinEvidenceV2] });

    if (
      patient.glycemia.acuteHyperglycemicCrisis === "dka" ||
      patient.glycemia.acuteHyperglycemicCrisis === "hhs" ||
      patient.glycemia.acuteHyperglycemicCrisis === "mixed" ||
      patient.glycemia.ketonesKnownPositive ||
      (state.severeHyperglycemia && patient.glycemia.catabolicFeatures)
    ) {
    rationale.push("Ketosis/catabolic features with severe hyperglycemia require urgent clinician assessment; routine outpatient titration logic must not mask an acute insulin-deficient state.");
    nodes.push({ id: "acute-insulin-deficiency", status: "blocked", summary: "Urgent clinician review supersedes routine titration.", evidence: [ada2026InsulinEvidenceV2] });
    return { status: "urgent_review", action: state.insulinAction, requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
  }

// GLYMIZE_INSUFFICIENT_GLYCEMIA_INSULIN_GUARD_V7
if (state.pathway === "insufficient_glycemic_data") {
  requiredInputs.push("glycemia.currentHba1c", "glycemia.targetHba1c");
  rationale.push("Core A1C context is incomplete; routine insulin selection/titration is withheld until required glycemic data are available.");
  nodes.push({
    id: "core-glycemia-data",
    status: "needs_data",
    summary: "Current A1C and individualized A1C target are required before routine glycemic treatment selection.",
    evidence: [ada2026InsulinEvidenceV2],
  });
  return {
    status: "needs_data",
    action: "none",
    requiresInsulinTool: false,
    requiredInputs,
    recommendedOptionalInputs,
    overbasalization,
    rationale,
    nodes,
    evidence: [ada2026InsulinEvidenceV2],
  };
}

if (state.insulinAction === "evaluate_start_basal") {
    if (patient.anthropometrics?.weightKg === undefined) {
      requiredInputs.push("anthropometrics.weightKg");
      nodes.push({ id: "basal-start-dose", status: "needs_data", summary: "Weight is required to calculate the ADA 2026 0.1-0.2 U/kg/day basal starting range.", evidence: [ada2026InsulinEvidenceV2] });
      return { status: "needs_data", action: state.insulinAction, requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
    }
    if (patient.glycemia.fastingPlasmaGlucoseMgDl === undefined) recommendedOptionalInputs.push("glycemia.fastingPlasmaGlucoseMgDl");
    rationale.push("Severe hyperglycemia criteria activate basal-insulin evaluation; starting dose is weight-based and individualized by severity.");
    nodes.push({ id: "basal-start-dose", status: "active", summary: "Launch basal insulin dose tool with patient weight and current glycemic context.", evidence: [ada2026InsulinEvidenceV2] });
    return { status: "start_basal", action: state.insulinAction, requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
  }

  if (!basal) {
    return { status: "not_active", action: state.insulinAction, requiresInsulinTool: false, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
  }

  if (overbasalization.suspected) {
    rationale.push(...overbasalization.reasons);
    if (!glp1) {
      nodes.push({ id: "overbasalization-review", status: "active", summary: "Overbasalization signal: reevaluate regimen and consider GLP-1-based/FRC therapy before routine prandial insulin when appropriate.", evidence: [ada2026InsulinEvidenceV2] });
      return { status: "consider_glp1_or_frc", action: "consider_glp1_or_frc_before_prandial", requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
    }
  }

  if (state.insulinAction === "titrate_basal") {
    rationale.push("Fasting glucose remains above the individualized target; basal titration should be driven by serial fasting glucose/SMBG or CGM with hypoglycemia surveillance.");
    nodes.push({ id: "basal-titration", status: "active", summary: "Launch basal titration tool.", evidence: [ada2026InsulinEvidenceV2] });
    return { status: "titrate_basal", action: state.insulinAction, requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
  }

  if (state.insulinAction === "request_postprandial_pattern") {
    requiredInputs.push("glycemia.twoHourPostprandialGlucoseMgDl_or_SMBG_or_CGM");
    nodes.push({ id: "postprandial-pattern", status: "needs_data", summary: "FPG is controlled while A1C remains above target; postprandial data are required before advancing insulin intensity.", evidence: [ada2026InsulinEvidenceV2] });
    return { status: "needs_data", action: state.insulinAction, requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
  }

  if (state.insulinAction === "consider_glp1_or_frc_before_prandial") {
    rationale.push("Basal insulin is optimized enough to expose postprandial hyperglycemia; ADA 2026 recommends considering GLP-1-based therapy/FRC before prandial insulin when not already used and clinically appropriate.");
    nodes.push({ id: "glp1-frc-before-prandial", status: "active", summary: "Evaluate GLP-1-based therapy or a registered FRC before prandial insulin.", evidence: [ada2026InsulinEvidenceV2] });
    return { status: "consider_glp1_or_frc", action: state.insulinAction, requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
  }

  if (state.insulinAction === "consider_premix") {
    rationale.push("Prandial coverage is needed, but multiple premeal injections are not feasible and meal pattern is regular; premixed insulin can be considered as a simpler alternative.");
    nodes.push({ id: "premix", status: "active", summary: "Evaluate a registered premix regimen and launch insulin conversion/dose tool.", evidence: [ada2026InsulinEvidenceV2] });
    return { status: "consider_premix", action: state.insulinAction, requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
  }

  if (state.insulinAction === "add_prandial") {
    rationale.push("Prandial intensification is now supported by postprandial evidence after basal optimization and GLP-1/FRC review.");
    nodes.push({ id: "prandial-start", status: "active", summary: "Launch prandial start tool: 4 U or 10% of basal dose with the largest meal, then individualize using SMBG/CGM.", evidence: [ada2026InsulinEvidenceV2] });
    return { status: "add_prandial", action: state.insulinAction, requiresInsulinTool: true, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
  }

  return { status: "maintain_current_insulin", action: state.insulinAction, requiresInsulinTool: false, requiredInputs, recommendedOptionalInputs, overbasalization, rationale, nodes, evidence: [ada2026InsulinEvidenceV2] };
}
