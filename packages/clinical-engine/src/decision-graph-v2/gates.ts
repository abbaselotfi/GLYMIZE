import { approvedDoseRulesForV2, resolveDocumentedCurrentDosePlanV2, resolveDosePlanV2 } from "./dose.js";
import { resolveExactCurrentRegimenFdcPlansV2 } from "./fdc-execution.js";
import { evaluateReviewedResmetiromProtocolV2 } from "./mash-protocols.js";
import { buildFactMapV2, evaluatePredicateV2 } from "./predicates.js";
import type {
  ClinicalObjectiveV2,
  ClinicalStateV2,
  DecisionGraphRequestV2,
  GateOutcomeV2,
  KnowledgeMedicationV2,
  RegimenCandidateV2,
} from "./types.js";

function medicationById(request: DecisionGraphRequestV2, id: string) {
  return request.inventory.knowledge.find((item) => item.masterDrugId === id);
}

function isInjectableRoute(route: string) {
  return ["subcutaneous", "intravenous", "intramuscular"].includes(route.toLocaleLowerCase());
}

function efficacyMeetsHigh(candidate: RegimenCandidateV2) {
  return candidate.efficacyBand === "high" || candidate.efficacyBand === "very_high" || candidate.components.length >= 2 || candidate.kind === "fixed_dose_combination";
}

function constituentIds(request: DecisionGraphRequestV2, masterDrugId: string) {
  const medication = medicationById(request, masterDrugId);
  if (!medication) return [masterDrugId];
  if (medication.combination && medication.componentMasterDrugIds?.length) return medication.componentMasterDrugIds;
  return [masterDrugId];
}

function candidateConstituentIds(request: DecisionGraphRequestV2, candidate: RegimenCandidateV2) {
  return new Set(candidate.components.flatMap((component) => constituentIds(request, component.masterDrugId)));
}

function hasReviewedReplacementPath(
  request: DecisionGraphRequestV2,
  currentMasterDrugId: string,
  candidate: RegimenCandidateV2,
) {
  const current = medicationById(request, currentMasterDrugId);
  if (!current) return false;
  if (candidate.components.some((component) => {
    const target = medicationById(request, component.masterDrugId);
    if (!target) return false;
    if (target.therapyGroup === "fixed_ratio_combination" && /insulin/.test(current.therapyGroup)) {
      return Boolean(component.doseOptions?.some((plan) => plan.productId || plan.selectionRole === "product_specific"));
    }
    return (request.inventory.insulinConversionRules ?? []).some((rule) =>
      rule.sourceMasterDrugId === currentMasterDrugId &&
      rule.targetMasterDrugId === component.masterDrugId &&
      rule.executionStatus === "executable",
    );
  })) return true;
  return false;
}

function applyCurrentTherapyTransitionGate(
  request: DecisionGraphRequestV2,
  state: ClinicalStateV2,
  result: RegimenCandidateV2,
  currentStatus: GateOutcomeV2["status"],
  reasons: string[],
) {
  if (result.lane !== "glycemic") return currentStatus;
  const active = (request.patient.currentMedications ?? []).filter((item) => {
    if ((item.status ?? "active") !== "active" || item.tolerance === "intolerant") return false;
    // Preserve unresolved identities as a fail-closed reconciliation concern, but
    // do not force known organ-protection medicines (RAAS/statin/MRA/etc.) into a
    // glycemic replacement decision merely because they are active medications.
    if (!item.masterDrugId) return true;
    const known = medicationById(request, item.masterDrugId);
    return known ? known.primaryLanes.includes("glycemic") : true;
  });
  if (!active.length) return currentStatus;

  const unresolved = active.filter((item) => !item.masterDrugId);
  if (unresolved.length) {
    if (currentStatus === "pass") currentStatus = "conditional";
    reasons.push("حداقل یک داروی فعال فعلی به MasterDrugId متصل نیست؛ Plan جدید تا medication reconciliation کامل، جایگزین خودکار رژیم فعلی نمی‌شود.");
  }

  const candidateIds = candidateConstituentIds(request, result);
  const recognized = active.filter((item): item is typeof item & { masterDrugId: string } => Boolean(item.masterDrugId));
  const missingCurrent = recognized.filter((item) => !candidateIds.has(item.masterDrugId));
  const preservedCurrent = recognized.filter((item) => candidateIds.has(item.masterDrugId));
  const newIngredients = [...candidateIds].filter((id) => !recognized.some((item) => item.masterDrugId === id));

  const unsupportedReplacement = missingCurrent.filter((item) => !hasReviewedReplacementPath(request, item.masterDrugId, result));
  if (unsupportedReplacement.length) {
    if (currentStatus === "pass") currentStatus = "conditional";
    reasons.push(`رژیم پیشنهادی ${unsupportedReplacement.map((item) => item.genericName).join("، ")} را بدون مسیر replacement/conversion تاییدشده حفظ نمی‌کند؛ Top Recommendation اجرایی تا بازبینی پزشک قفل است.`);
  }

  if (state.hba1cGap > 0 && recognized.length && newIngredients.length === 0 && preservedCurrent.length === recognized.length) {
    if (currentStatus === "pass") currentStatus = "conditional";
    reasons.push("A1C بالاتر از هدف است اما Candidate فقط همان اجزای درمان فعلی را بازتولید می‌کند و intensification ساختاریافته‌ای اضافه نمی‌کند.");
  }

  return currentStatus;
}

export function candidateMeetsObjectiveV2(candidate: RegimenCandidateV2, objective: ClinicalObjectiveV2) {
  if (objective.id === "glycemic_control") return candidate.objectiveCoverage.includes("glycemic_control");
  if (objective.id === "high_efficacy_glycemic_control") return candidate.objectiveCoverage.includes("glycemic_control") && efficacyMeetsHigh(candidate);
  if (objective.id === "insulin_replacement") return candidate.components.some((component) => /insulin|fixed_ratio_combination/.test(component.therapyGroup));
  return candidate.objectiveCoverage.includes(objective.id);
}

export function applyHardGatesV2(
  request: DecisionGraphRequestV2,
  state: ClinicalStateV2,
  objectives: readonly ClinicalObjectiveV2[],
  candidate: RegimenCandidateV2,
): RegimenCandidateV2 {
  const result = structuredClone(candidate);
  const reasons: string[] = [];
  const evidence = [] as GateOutcomeV2["evidence"];
  const facts = buildFactMapV2(request.patient, state.severeHyperglycemia);
  let status: GateOutcomeV2["status"] = "pass";

  for (const component of result.components) {
    const medication = medicationById(request, component.masterDrugId);
    if (!medication) {
      status = "exclude";
      reasons.push(`Knowledge medication ${component.masterDrugId} پیدا نشد.`);
      continue;
    }
    if (medication.engineState !== "approved") {
      status = "exclude";
      reasons.push(`${medication.genericName}: Clinical engine state=${medication.engineState}; فقط approved مجاز است.`);
    }

    const availability = component.availability;
    if (availability.classification === "historical_only" || availability.classification === "current_license_market_unconfirmed") {
      if (status !== "exclude") status = "historical_only";
      reasons.push(...availability.reasons);
    } else if (!availability.mainRecommendationEligible) {
      status = "exclude";
      reasons.push(...availability.reasons);
    }

    const mashProtocol = evaluateReviewedResmetiromProtocolV2(request.patient, medication);
    if (mashProtocol) {
      evidence.push(...mashProtocol.evidence);
      reasons.push(...mashProtocol.reasons);
      if (mashProtocol.status === "exclude") status = "exclude";
      else if (mashProtocol.status === "needs_data" && status !== "exclude") status = "needs_data";
      else if (mashProtocol.status === "conditional" && status === "pass") status = "conditional";
    }

    const applicableRules = (request.inventory.medicationGateRules ?? []).filter((rule) =>
      (!rule.masterDrugId || rule.masterDrugId === medication.masterDrugId) &&
      (!rule.therapyGroup || rule.therapyGroup === medication.therapyGroup) &&
      evaluatePredicateV2(rule.when, facts),
    );
    for (const rule of applicableRules) {
      evidence.push(...rule.evidence);
      reasons.push(rule.reason);
      if (rule.effect === "exclude") status = "exclude";
      else if (status === "pass") status = "conditional";
    }

    const routes = medication.routeOptions;
    if (request.preferences.routePreference === "oral_only" && routes.every(isInjectableRoute)) {
      if (state.pathway === "insulin_centered" && /insulin|fixed_ratio_combination/.test(medication.therapyGroup)) {
        result.routeFit = "conflict_overridden";
        result.preferenceConflicts.push("ترجیح oral-only با ضرورت بالینی بررسی انسولین تعارض دارد؛ الزام بالینی بر preference مقدم شده است.");
      } else {
        status = "exclude";
        reasons.push("پزشک/بیمار مسیر oral-only را به‌عنوان constraint انتخاب کرده است.");
      }
    } else if (request.preferences.routePreference === "prefer_oral" && routes.every(isInjectableRoute)) {
      result.routeFit = "neutral";
      result.preferenceConflicts.push("گزینه تزریقی با ترجیح مسیر خوراکی هم‌راستا نیست.");
    } else {
      result.routeFit = "match";
    }

    // Top recommendation requires at least one approved structured dose path.
    // Multiple clinically valid formulations are preserved until the market/cost
    // execution node; no arbitrary first-rule selection is allowed.
    const currentMedication = (request.patient.currentMedications ?? []).find((item) =>
      (item.status ?? "active") === "active" &&
      (item.masterDrugId === component.masterDrugId || item.genericName.toLocaleLowerCase() === medication.genericName.toLocaleLowerCase()),
    );
    const useCase = currentMedication ? "continuation" as const : "initiation" as const;
    let approvedRules = approvedDoseRulesForV2(component.masterDrugId, request.inventory.doseRules, facts, useCase, result.lane);
    if (mashProtocol?.doseRuleId) {
      approvedRules = approvedRules.filter((rule) => rule.id === mashProtocol.doseRuleId);
    } else if (mashProtocol && mashProtocol.status !== "pass") {
      approvedRules = [];
    }
    const rulePlans = approvedRules
      .map((rule) => resolveDosePlanV2(rule, request.patient, state))
      .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
    const documentedCurrentPlan = currentMedication ? resolveDocumentedCurrentDosePlanV2(component.masterDrugId, request.patient, medication.evidence) : undefined;
    const exactFdcPlans = medication.combination ? resolveExactCurrentRegimenFdcPlansV2(request, medication) : [];
    const plans = [...rulePlans, ...(documentedCurrentPlan ? [documentedCurrentPlan] : []), ...exactFdcPlans];
    if (!approvedRules.length && !exactFdcPlans.length && !documentedCurrentPlan) {
      if (status === "pass") status = "conditional";
      result.cautions.push("Dose Rule ساختاریافته و approved برای این دارو/مرحله درمان موجود نیست؛ Top Recommendation اجرایی مجاز نیست.");
    } else if (plans.length) {
      component.doseOptions = plans;
      if (plans.length === 1) component.dosePlan = plans[0];
      if (exactFdcPlans.length) result.reasons.push("FDC exact-dose simplification is available for the documented current component regimen; no component dose was inferred or changed.");
    } else {
      if (status === "pass") status = "needs_data";
      result.cautions.push("Dose Rule مناسب است اما داده لازم برای حل دوز کامل نیست.");
    }
  }

  status = applyCurrentTherapyTransitionGate(request, state, result, status, reasons);

  const mandatory = objectives.filter((objective) => objective.level === "mandatory" && objective.lane === result.lane);
  const unmet = mandatory.filter((objective) => !candidateMeetsObjectiveV2(result, objective));
  if (unmet.length) {
    status = "exclude";
    for (const objective of unmet) reasons.push(`هدف mandatory پوشش داده نشده: ${objective.id}`);
  }

  result.gate = { status, reasons, evidence };
  return result;
}
