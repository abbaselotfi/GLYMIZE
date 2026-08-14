import type {
  StrengthComponentV2,
  TitrationProtocolV2,
  TitrationRecommendationV2,
  TitrationRequestV2,
} from "./types.js";

const EPS = 1e-8;

function sameDose(left: readonly StrengthComponentV2[], right: readonly StrengthComponentV2[]) {
  if (left.length !== right.length) return false;
  const key = (item: StrengthComponentV2) => `${item.ingredientKey}|${item.unit.toLocaleLowerCase()}`;
  const rightMap = new Map(right.map((item) => [key(item), item.amount]));
  return left.every((item) => {
    const amount = rightMap.get(key(item));
    return amount !== undefined && Math.abs(amount - item.amount) <= EPS;
  });
}

function median(values: readonly number[]) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

function result(
  action: TitrationRecommendationV2["action"],
  rationale: string[],
  protocol?: TitrationProtocolV2,
  nextDose?: StrengthComponentV2[],
): TitrationRecommendationV2 {
  return {
    protocolId: protocol?.id,
    action,
    nextDose,
    rationale,
    evidence: protocol?.evidence ?? [],
    clinicianConfirmationRequired: true,
  };
}

export function resolveTitrationRecommendationV2(
  request: TitrationRequestV2,
  protocols: readonly TitrationProtocolV2[],
): TitrationRecommendationV2 {
  const protocol = protocols.find((item) =>
    item.masterDrugId === request.masterDrugId && item.reviewState === "approved",
  );
  if (!protocol) return result("needs_data", ["No approved structured titration protocol exists for this medication."]);

  if (request.symptomaticHypoglycemia || request.glucoseBelow70MgDl) {
    return result("stop_and_review", ["Hypoglycemia signal is present; automated up-titration is blocked and the regimen requires clinician review."], protocol);
  }
  if (request.tolerability === "intolerant") {
    return result("stop_and_review", ["Medication intolerance is documented; automated dose escalation is blocked."], protocol);
  }
  if (request.tolerability === "limited") {
    return result("hold", ["Tolerability is limited; maintain the current dose until adverse effects are reassessed rather than escalating automatically."], protocol, request.currentDose.map((item) => ({ ...item })));
  }

  if (protocol.kind === "stepwise_fixed") {
    const steps = protocol.steps ?? [];
    const step = steps.find((item) => sameDose(item.currentDose, request.currentDose));
    if (!step) return result("needs_data", ["Current dose does not map to a reviewed titration step; Decision Graph will not infer an intermediate dose."], protocol);
    if (protocol.minimumDaysOnCurrentDose !== undefined) {
      if (request.daysOnCurrentDose === undefined) return result("needs_data", ["Days on the current dose are required before the next reviewed titration step can be considered."], protocol);
      if (request.daysOnCurrentDose < protocol.minimumDaysOnCurrentDose) {
        return result("hold", [`Minimum reviewed interval is ${protocol.minimumDaysOnCurrentDose} days; current exposure is ${request.daysOnCurrentDose} days.`], protocol, request.currentDose.map((item) => ({ ...item })));
      }
    }
    if (request.additionalGlycemicControlNeeded === undefined) {
      return result("needs_data", ["Whether additional glycemic control is still required must be documented before dose escalation."], protocol);
    }
    if (!request.additionalGlycemicControlNeeded) {
      return result("maintain", ["Current glycemic control does not require further dose escalation."], protocol, request.currentDose.map((item) => ({ ...item })));
    }
    return result("increase", [step.reason], protocol, step.nextDose.map((item) => ({ ...item })));
  }

  const basal = protocol.basal;
  if (!basal) return result("needs_data", ["Basal titration configuration is incomplete."], protocol);
  if (request.daysOnCurrentDose === undefined) return result("needs_data", ["Days since the last basal dose change are required."], protocol);
  if (request.daysOnCurrentDose < basal.minimumDaysBetweenChanges) {
    return result("hold", [`Basal dose should not be changed before ${basal.minimumDaysBetweenChanges} days in this reviewed protocol.`], protocol, request.currentDose.map((item) => ({ ...item })));
  }
  const fasting = median((request.fastingGlucoseMgDl ?? []).slice(-3));
  if (fasting === undefined) return result("needs_data", ["Recent fasting glucose values are required for basal titration."], protocol);
  const insulin = request.currentDose.find((item) => item.unit.toLocaleLowerCase() === "u");
  if (!insulin) return result("needs_data", ["Current basal insulin dose in units is required."], protocol);

  if (fasting > basal.targetHighMgDl) {
    return result("increase", [`Median fasting glucose ${Math.round(fasting)} mg/dL is above the protocol target; increase by ${basal.increaseUnits} U.`], protocol, [{ ...insulin, amount: insulin.amount + basal.increaseUnits }]);
  }
  if (fasting < basal.targetLowMgDl) {
    const next = Math.max(basal.minimumDoseUnits, insulin.amount - basal.decreaseUnits);
    return result("reduce", [`Median fasting glucose ${Math.round(fasting)} mg/dL is below the protocol target; reduce by ${basal.decreaseUnits} U.`], protocol, [{ ...insulin, amount: next }]);
  }
  return result("maintain", [`Median fasting glucose ${Math.round(fasting)} mg/dL is within the reviewed target range.`], protocol, request.currentDose.map((item) => ({ ...item })));
}
