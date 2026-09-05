import { paretoPruneV2 } from "./pareto.js";
import { selectLexicographicallyV2 } from "./selector.js";
import { phaseAwareTitrationCostV2 } from "./wegovy-titration-cost.js";
import type {
  ClinicalObjectiveIdV2,
  ClinicalObjectiveV2,
  ClinicalStateV2,
  ComposedTherapyComponentV2,
  ComposedTreatmentPlanV2,
  CurrentMedicationV2,
  DecisionGraphRequestV2,
  RegimenCandidateV2,
  RegimenComponentV2,
  StrengthComponentV2,
} from "./types.js";

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function normalized(value: string | undefined) {
  return (value ?? "").toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function planDoseSignature(plan: RegimenComponentV2["dosePlan"]) {
  if (!plan) return "none";
  const values = plan.perAdministrationComponents ?? plan.dailyComponents ?? [];
  return JSON.stringify({
    form: plan.dosageFormGroup ?? "",
    values: [...values].sort((a, b) => `${a.ingredientKey}:${a.unit}`.localeCompare(`${b.ingredientKey}:${b.unit}`)),
    administrationsPerDay: plan.administrationsPerDay,
    administrationsPer30Days: plan.administrationsPer30Days,
    productId: plan.productId,
  });
}

function componentDoseSignature(component: RegimenComponentV2) {
  return planDoseSignature(component.dosePlan);
}

function sameDoseComponents(left?: readonly StrengthComponentV2[], right?: readonly StrengthComponentV2[]) {
  if (!left || !right || left.length !== right.length) return false;
  const key = (item: StrengthComponentV2) => `${item.ingredientKey}|${item.unit}|${item.amount}`;
  return [...left].map(key).sort().join(";") === [...right].map(key).sort().join(";");
}

function activeCurrentMedications(request: DecisionGraphRequestV2) {
  return (request.patient.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active");
}

function currentMedicationFor(request: DecisionGraphRequestV2, masterDrugId: string) {
  return activeCurrentMedications(request).find((item) => item.masterDrugId === masterDrugId);
}

function actionForComponent(request: DecisionGraphRequestV2, component: RegimenComponentV2): ComposedTherapyComponentV2["action"] {
  const current = currentMedicationFor(request, component.masterDrugId);
  if (!current) return "start";
  if (!component.dosePlan || !current.dailyDose) return "continue";
  if (component.dosePlan.dailyComponents && sameDoseComponents(component.dosePlan.dailyComponents, current.dailyDose)) return "continue";
  return "continue_with_dose_reconciliation";
}

function patientCostForComponent(request: DecisionGraphRequestV2, component: RegimenComponentV2) {
  const phasePlan = phaseAwareTitrationCostV2(component);
  if (phasePlan) {
    // A phase-aware cash/consumption plan is authoritative for non-insured cost.
    // Insured-only remains unknown until per-phase claim timing is implemented.
    if (request.preferences.costPreference === "insured_only") return undefined;
    return phasePlan.normalizedTreatmentValueToman;
  }
  const cost = component.selectedProductCost;
  if (cost) {
    const selectedProviders = request.preferences.insuranceProviders ?? [];
    if (request.preferences.costPreference === "insured_only" && selectedProviders.length) {
      const insurerOptions = cost.insurance.filter((item) =>
        selectedProviders.includes(item.provider) && (item.eligibility === "eligible" || item.eligibility === "conditional"),
      );
      if (insurerOptions.length) return Math.min(...insurerOptions.map((item) => item.patientCostIfEligibleToman));
    }
    return cost.normalized30DayTreatmentCostToman;
  }
  return component.genericCostBenchmark?.referenceNormalized30DayCostToman;
}

function knowledgeFor(request: DecisionGraphRequestV2, masterDrugId: string) {
  return request.inventory.knowledge.find((item) => item.masterDrugId === masterDrugId);
}

function ingredientIds(request: DecisionGraphRequestV2, masterDrugId: string) {
  const medication = knowledgeFor(request, masterDrugId);
  if (!medication) return [masterDrugId];
  if (medication.combination && medication.componentMasterDrugIds?.length) return medication.componentMasterDrugIds;
  return [masterDrugId];
}

function componentTags(component: RegimenComponentV2) {
  return unique([component.therapyGroup, ...component.tags]);
}

function regimenConflict(request: DecisionGraphRequestV2, left: RegimenComponentV2, right: RegimenComponentV2) {
  const leftIngredients = new Set(ingredientIds(request, left.masterDrugId));
  if (ingredientIds(request, right.masterDrugId).some((id) => leftIngredients.has(id))) {
    if (left.masterDrugId === right.masterDrugId) return undefined;
    return "داروی ترکیبی/منفرد دارای جزء فعال تکراری است.";
  }

  const leftTags = componentTags(left);
  const rightTags = componentTags(right);
  for (const rule of request.inventory.regimenConflictRules ?? []) {
    const direct = leftTags.includes(rule.tagA) && rightTags.includes(rule.tagB);
    const reverse = leftTags.includes(rule.tagB) && rightTags.includes(rule.tagA);
    if (direct || reverse) return rule.reason;
  }

  // Therapeutic duplication is a structural conflict rather than a penalty.
  // Distinct basal/prandial insulin groups are already separate therapyGroup values,
  // so exact same-group duplication can be rejected safely.
  if (left.therapyGroup === right.therapyGroup && left.therapyGroup !== "other") {
    return `دو دارو از یک therapy group (${left.therapyGroup}) هم‌زمان انتخاب شده‌اند.`;
  }
  return undefined;
}

function candidateCompatibleWithComponents(
  request: DecisionGraphRequestV2,
  candidate: RegimenCandidateV2,
  selected: readonly ComposedTherapyComponentV2[],
) {
  for (const incoming of candidate.components) {
    for (const existing of selected) {
      if (incoming.masterDrugId === existing.masterDrugId) continue;
      const existingAsRegimen: RegimenComponentV2 = {
        masterDrugId: existing.masterDrugId,
        genericName: existing.genericName,
        persianName: existing.persianName,
        therapyGroup: existing.therapyGroup,
        tags: existing.tags,
        availability: { masterDrugId: existing.masterDrugId, classification: "current_market", mainRecommendationEligible: true, moreOptionsEligible: true, currentProductIds: [], historicalProductIds: [], reasons: [] },
      };
      if (regimenConflict(request, existingAsRegimen, incoming)) return false;
    }
  }
  return true;
}

function candidateOverlapsSelected(candidate: RegimenCandidateV2, selected: readonly ComposedTherapyComponentV2[]) {
  const ids = new Set(selected.map((item) => item.masterDrugId));
  return candidate.components.some((item) => ids.has(item.masterDrugId));
}

function laneCandidateForObjective(
  request: DecisionGraphRequestV2,
  objectives: readonly ClinicalObjectiveV2[],
  objective: ClinicalObjectiveV2,
  candidates: readonly RegimenCandidateV2[],
  selected: readonly ComposedTherapyComponentV2[],
) {
  const pool = candidates.filter((candidate) =>
    candidate.gate.status === "pass" &&
    candidate.lane === objective.lane &&
    candidate.objectiveCoverage.includes(objective.id) &&
    candidateCompatibleWithComponents(request, candidate, selected),
  );
  if (!pool.length) return undefined;

  // Outcome-strength is categorical. If at least one candidate has explicit
  // strong benefit for the mandatory objective, a weaker "benefit" candidate
  // cannot win merely because it overlaps an existing drug or is cheaper.
  const strongest = pool.filter((candidate) => candidate.objectiveStrength[objective.id] === "strong_benefit");
  const clinicallyQualified = strongest.length ? strongest : pool;

  // If an already-selected molecule can satisfy this lane at the same categorical
  // evidence tier, prefer that exact molecule before adding another product.
  const overlapping = clinicallyQualified.filter((candidate) => candidateOverlapsSelected(candidate, selected));
  const source = overlapping.length ? overlapping : clinicallyQualified;
  const pruned = paretoPruneV2(source, objectives);
  return selectLexicographicallyV2(pruned, request, objectives)[0];
}

function objectivesForCandidate(candidate: RegimenCandidateV2, objectives: readonly ClinicalObjectiveV2[]) {
  return objectives
    .filter((objective) => objective.lane === candidate.lane && candidate.objectiveCoverage.includes(objective.id))
    .map((objective) => objective.id);
}

function mergeCandidateIntoPlan(
  request: DecisionGraphRequestV2,
  planComponents: ComposedTherapyComponentV2[],
  candidate: RegimenCandidateV2,
  objectivesServed: readonly ClinicalObjectiveIdV2[],
  cautions: string[],
) {
  for (const incoming of candidate.components) {
    const existing = planComponents.find((item) => item.masterDrugId === incoming.masterDrugId);
    if (!existing) {
      planComponents.push({
        masterDrugId: incoming.masterDrugId,
        genericName: incoming.genericName,
        persianName: incoming.persianName,
        therapyGroup: incoming.therapyGroup,
        tags: [...incoming.tags],
        action: actionForComponent(request, incoming),
        sourceRegimenIds: [candidate.regimenId],
        sourceLanes: [candidate.lane],
        servesObjectives: unique(objectivesServed),
        dosePlan: incoming.dosePlan,
        selectedProduct: incoming.selectedProduct,
        selectedProductCost: incoming.selectedProductCost,
        normalized30DayPatientCostToman: patientCostForComponent(request, incoming),
        reasons: [...candidate.reasons],
      });
      continue;
    }

    const existingOnlyGlycemicBeforeMerge = existing.sourceLanes.every((lane) => lane === "glycemic");
    existing.sourceRegimenIds = unique([...existing.sourceRegimenIds, candidate.regimenId]);
    existing.sourceLanes = unique([...existing.sourceLanes, candidate.lane]);
    existing.servesObjectives = unique([...existing.servesObjectives, ...objectivesServed]);

    if (!incoming.dosePlan) continue;
    if (!existing.dosePlan) {
      existing.dosePlan = incoming.dosePlan;
      existing.selectedProduct = incoming.selectedProduct;
      existing.selectedProductCost = incoming.selectedProductCost;
      existing.normalized30DayPatientCostToman = patientCostForComponent(request, incoming);
      existing.action = actionForComponent(request, incoming);
      continue;
    }

    if (componentDoseSignature(incoming) === planDoseSignature(existing.dosePlan)) continue;

    // Mandatory organ-protection dosing may supersede a glycemic starting dose
    // for the same molecule (e.g. a lane-specific reviewed label dose). If two
    // non-glycemic mandatory lanes disagree, do not guess.
    if (existingOnlyGlycemicBeforeMerge && candidate.lane !== "glycemic") {
      existing.dosePlan = incoming.dosePlan;
      existing.selectedProduct = incoming.selectedProduct;
      existing.selectedProductCost = incoming.selectedProductCost;
      existing.normalized30DayPatientCostToman = patientCostForComponent(request, incoming);
      existing.action = actionForComponent(request, incoming);
      existing.reasons.push(`دوز با lane ${candidate.lane} تطبیق داده شد تا همان مولکول یک هدف اجباری دیگر را نیز پوشش دهد.`);
    } else {
      cautions.push(`${incoming.genericName}: دو lane بالینی به Dose Plan متفاوت رسیده‌اند؛ موتور بدون Rule reconciliation دوز را ادغام نکرد.`);
    }
  }
}

function currentTherapyReview(
  request: DecisionGraphRequestV2,
  state: ClinicalStateV2,
  planComponents: readonly ComposedTherapyComponentV2[],
) {
  const finalIds = new Set(planComponents.map((item) => item.masterDrugId));
  const finalGroups = new Map(planComponents.map((item) => [item.therapyGroup, item.masterDrugId]));
  return activeCurrentMedications(request).map((current) => {
    if (!current.masterDrugId) {
      return { masterDrugId: current.masterDrugId, genericName: current.genericName, disposition: "unresolved_identity" as const, reason: "داروی فعلی به MasterDrugId متصل نیست؛ Decision Graph اجازه توقف/جایگزینی خودکار ندارد." };
    }
    if (finalIds.has(current.masterDrugId)) {
      return { masterDrugId: current.masterDrugId, genericName: current.genericName, disposition: "continue_in_plan" as const, reason: "داروی فعلی در Plan نهایی حفظ شده است؛ هر تغییر دوز جداگانه نیازمند تأیید پزشک است." };
    }
    if (state.pathway === "maintain_and_monitor") {
      return { masterDrugId: current.masterDrugId, genericName: current.genericName, disposition: "continue_pending_standard_review" as const, reason: "A1C مسیر تشدید جدید را فعال نکرده است؛ نبود دارو در Plan به معنی دستور قطع نیست." };
    }
    if (current.therapyGroup && finalGroups.has(current.therapyGroup)) {
      return { masterDrugId: current.masterDrugId, genericName: current.genericName, disposition: "review_for_replacement" as const, reason: `Plan یک داروی دیگر از therapy group ${current.therapyGroup} دارد؛ جایگزینی باید توسط پزشک تأیید شود.` };
    }
    return { masterDrugId: current.masterDrugId, genericName: current.genericName, disposition: "review_for_discontinuation" as const, reason: "داروی فعلی در Strategy جدید بازتولید نشده است؛ این فقط Flag برای بازبینی است و دستور قطع خودکار نیست." };
  });
}

export function composeTreatmentPlanV2(input: {
  request: DecisionGraphRequestV2;
  state: ClinicalStateV2;
  objectives: readonly ClinicalObjectiveV2[];
  glycemicRegimen?: RegimenCandidateV2;
  executableCandidates: readonly RegimenCandidateV2[];
}): ComposedTreatmentPlanV2 | undefined {
  const { request, state, objectives, glycemicRegimen, executableCandidates } = input;
  const planComponents: ComposedTherapyComponentV2[] = [];
  const supportingRegimenIds: string[] = [];
  const covered = new Set<ClinicalObjectiveIdV2>();
  const reasons: string[] = [];
  const cautions: string[] = [];

  if (glycemicRegimen) {
    const glycemicObjectives = objectivesForCandidate(glycemicRegimen, objectives.filter((item) => item.lane === "glycemic"));
    mergeCandidateIntoPlan(request, planComponents, glycemicRegimen, glycemicObjectives, cautions);
    glycemicObjectives.forEach((id) => covered.add(id));
    reasons.push(`رژیم گلیسمیک ${glycemicRegimen.regimenId} به‌عنوان ستون اصلی Plan استفاده شد.`);
  }

  const nonGlycemicObjectives = objectives.filter((objective) => objective.lane !== "glycemic" && objective.level !== "preference");
  for (const objective of nonGlycemicObjectives) {
    const selected = laneCandidateForObjective(request, objectives, objective, executableCandidates, planComponents);
    if (!selected) continue;
    const overlappedBeforeMerge = candidateOverlapsSelected(selected, planComponents);
    mergeCandidateIntoPlan(request, planComponents, selected, [objective.id], cautions);
    covered.add(objective.id);
    supportingRegimenIds.push(selected.regimenId);
    if (overlappedBeforeMerge) {
      reasons.push(`${objective.id} با استفاده/بازتنظیم یک مولکول موجود در Plan پوشش داده شد تا از polypharmacy غیرضروری جلوگیری شود.`);
    } else {
      reasons.push(`${objective.id} به‌عنوان lane مستقل به Plan اضافه شد.`);
    }
  }

  const requiredObjectives = objectives.filter((item) => item.level === "mandatory");
  const unresolved = requiredObjectives.filter((item) => !covered.has(item.id)).map((item) => item.id);

  // No new therapy plan is created solely because market candidates exist. If
  // glycemia is already at target and there is no active non-glycemic objective,
  // current therapy remains a review/monitoring concern rather than a new start.
  if (!planComponents.length && !glycemicRegimen && nonGlycemicObjectives.length === 0) return undefined;

  const knownCosts = planComponents.map((item) => item.normalized30DayPatientCostToman);
  const monthlyPatientCostToman = knownCosts.every((value) => value !== undefined)
    ? Math.round((knownCosts as number[]).reduce((sum, value) => sum + value, 0))
    : undefined;
  const dailyAdministrationBurden = planComponents.reduce((sum, item) => sum + (item.dosePlan?.administrationsPerDay ?? 0), 0) || undefined;

  return {
    planId: `plan:${glycemicRegimen?.regimenId ?? "organ-only"}:${unique(supportingRegimenIds).sort().join("+") || "none"}`,
    glycemicRegimenId: glycemicRegimen?.regimenId,
    supportingRegimenIds: unique(supportingRegimenIds),
    components: planComponents,
    coveredObjectives: [...covered],
    unresolvedObjectives: unique(unresolved),
    monthlyPatientCostToman,
    dailyAdministrationBurden,
    currentTherapyReview: currentTherapyReview(request, state, planComponents),
    reasons,
    cautions,
  };
}
