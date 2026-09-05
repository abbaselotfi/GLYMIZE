import {
  currentMedicationAdministrationIntervalV2,
  type IntervalAwareCurrentMedicationV2,
} from "./current-medication-interval.js";
import type {
  DecisionGraphRequestV2,
  DoseRuleV2,
  IranMarketProductV2,
  ProductMonthlyCostV2,
  RegimenComponentV2,
  StrengthComponentV2,
} from "./types.js";

const EPS = 1e-8;
const WEGOVY_STEPS_MG = [0.25, 0.5, 1, 1.7, 2.4] as const;
type WegovyStepMgV2 = (typeof WEGOVY_STEPS_MG)[number];

export interface WegovyContinuationCostPhaseV2 {
  doseMg: WegovyStepMgV2;
  firstAdministrationDay: number;
  lastAdministrationDay: number;
  administrationsInWindow: number;
  productId: string;
  brandName?: string;
  consumptionUnitsUsed: number;
  consumedDrugValueToman: number;
}

export interface WegovyContinuationProductPurchaseV2 {
  productId: string;
  brandName?: string;
  consumptionUnitsUsed: number;
  purchaseUnitsRequired: number;
  purchasedConsumptionUnits: number;
  leftoverConsumptionUnits: number;
  cashPurchaseCostToman: number;
  consumedDrugValueToman: number;
  carryoverInventoryValueToman: number;
}

export interface WegovyMashContinuationWindowCostV2 {
  kind: "wegovy_mash_continuation_window";
  costAuthority: "executable" | "conditional_projection";
  windowDays: number;
  scheduleSourceId: "US-LABEL-WEGOVY-2026-06";
  currentDoseMg: WegovyStepMgV2;
  selectedDoseMg: WegovyStepMgV2;
  daysOnCurrentDose: number;
  nextAdministrationInDays: number;
  therapyPhase: "initiation" | "escalation" | "maintenance";
  projectionAssumption?: string;
  phases: WegovyContinuationCostPhaseV2[];
  productPurchases: WegovyContinuationProductPurchaseV2[];
  totalAdministrations: number;
  cashPurchaseCostToman: number;
  normalizedTreatmentValueToman: number;
  carryoverInventoryValueToman: number;
  insuranceProjection: "not_projected_continuation_claim_timing_required";
}

export type ContinuationCostAwareRegimenComponentV2 = RegimenComponentV2 & {
  wegovyContinuationCostPlan?: WegovyMashContinuationWindowCostV2;
};

function normalized(value: string | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function positiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function exactStepFromComponents(components: readonly StrengthComponentV2[] | undefined): WegovyStepMgV2 | undefined {
  if (components?.length !== 1) return undefined;
  const component = components[0];
  if (!component || normalized(component.unit) !== "mg" || !Number.isFinite(component.amount)) return undefined;
  return WEGOVY_STEPS_MG.find((step) => Math.abs(step - component.amount) <= EPS);
}

function exactStepFromRule(rule: DoseRuleV2): WegovyStepMgV2 | undefined {
  if (
    rule.reviewState !== "approved" ||
    rule.lane !== "liver" ||
    !rule.id.startsWith("LABEL-WEGOVY-MASH-") ||
    !rule.productId ||
    rule.formula.kind !== "fixed_interval_components" ||
    rule.formula.administrationsPerPeriod !== 1 ||
    rule.formula.periodDays !== 7
  ) return undefined;
  return exactStepFromComponents(rule.formula.componentsPerAdministration);
}

function currentVerifiedWegovy(product: IranMarketProductV2, masterDrugId: string) {
  return product.masterDrugId === masterDrugId &&
    normalized(product.brandName) === "wegovy" &&
    normalized(product.route).includes("subcutaneous") &&
    product.nfiMatchState === "verified" &&
    product.license.currentValid &&
    !product.license.revoked &&
    (product.marketPresence === "confirmed_active" || product.marketPresence === "recently_observed");
}

function currentMedicationFor(request: DecisionGraphRequestV2, masterDrugId: string) {
  return (request.patient.currentMedications ?? []).find((item) => {
    const extended = item as IntervalAwareCurrentMedicationV2;
    return (item.status ?? "active") === "active" &&
      item.masterDrugId === masterDrugId &&
      normalized(extended.brandName) === "wegovy";
  });
}

function productUnitsPerAdministration(desired: StrengthComponentV2, product: IranMarketProductV2) {
  const strength = product.strengthComponents.find((item) =>
    item.ingredientKey === desired.ingredientKey && normalized(item.unit) === normalized(desired.unit),
  );
  if (!strength || !positiveFinite(strength.amount)) return undefined;
  const ratio = desired.amount / strength.amount;
  return positiveFinite(ratio) ? ratio : undefined;
}

function uniqueProductForStep(input: {
  request: DecisionGraphRequestV2;
  masterDrugId: string;
  step: WegovyStepMgV2;
  exactProductId?: string;
}) {
  const candidates = input.request.inventory.doseRules.flatMap((rule) => {
    if (rule.masterDrugId !== input.masterDrugId || exactStepFromRule(rule) !== input.step || !rule.productId) return [];
    if (input.exactProductId && rule.productId !== input.exactProductId) return [];
    const product = input.request.inventory.marketProducts.find((item) =>
      item.productId === rule.productId && currentVerifiedWegovy(item, input.masterDrugId),
    );
    return product && rule.formula.kind === "fixed_interval_components" ? [{ rule, product }] : [];
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

function nextStep(step: WegovyStepMgV2): WegovyStepMgV2 | undefined {
  const index = WEGOVY_STEPS_MG.indexOf(step);
  return WEGOVY_STEPS_MG[index + 1];
}

function selectedPlanMatchesClinicalContinuation(input: {
  current: IntervalAwareCurrentMedicationV2;
  currentStep: WegovyStepMgV2;
  selectedStep: WegovyStepMgV2;
  daysOnCurrentDose: number;
  therapyPhase: "initiation" | "escalation" | "maintenance";
}) {
  const { current, currentStep, selectedStep, daysOnCurrentDose, therapyPhase } = input;
  if (current.adherence !== "good") return false;
  if (current.tolerance !== "good" && current.tolerance !== "limited") return false;

  if (selectedStep !== currentStep) {
    return therapyPhase === "escalation" &&
      daysOnCurrentDose >= 28 &&
      current.tolerance === "good" &&
      nextStep(currentStep) === selectedStep;
  }

  // With good tolerability after a complete escalation stage, Task 4 must have
  // selected the exact next dose. A stale same-step plan is not valid financial
  // input and must not let the cost layer become a second titration authority.
  if (
    therapyPhase === "escalation" &&
    daysOnCurrentDose >= 28 &&
    current.tolerance === "good" &&
    nextStep(currentStep) !== undefined
  ) return false;

  return true;
}

function addAdministration(input: {
  used: Map<string, { product: IranMarketProductV2; units: number; value: number }>;
  phaseMap: Map<string, WegovyContinuationCostPhaseV2>;
  product: IranMarketProductV2;
  desired: StrengthComponentV2;
  step: WegovyStepMgV2;
  day: number;
}) {
  const unitsPerAdministration = productUnitsPerAdministration(input.desired, input.product);
  if (!positiveFinite(unitsPerAdministration) || !positiveFinite(input.product.priceToman) || !positiveFinite(input.product.consumptionUnitsPerPurchaseUnit)) {
    return false;
  }
  const unitValue = input.product.priceToman / input.product.consumptionUnitsPerPurchaseUnit;
  const consumedValue = unitsPerAdministration * unitValue;
  if (![unitValue, consumedValue].every((value) => Number.isFinite(value) && value >= 0)) return false;

  const phaseKey = `${input.step}|${input.product.productId}`;
  const phase = input.phaseMap.get(phaseKey);
  if (phase) {
    phase.lastAdministrationDay = input.day;
    phase.administrationsInWindow += 1;
    phase.consumptionUnitsUsed += unitsPerAdministration;
    phase.consumedDrugValueToman = Math.round(phase.consumedDrugValueToman + consumedValue);
  } else {
    input.phaseMap.set(phaseKey, {
      doseMg: input.step,
      firstAdministrationDay: input.day,
      lastAdministrationDay: input.day,
      administrationsInWindow: 1,
      productId: input.product.productId,
      brandName: input.product.brandName,
      consumptionUnitsUsed: unitsPerAdministration,
      consumedDrugValueToman: Math.round(consumedValue),
    });
  }

  const existing = input.used.get(input.product.productId);
  input.used.set(input.product.productId, {
    product: input.product,
    units: (existing?.units ?? 0) + unitsPerAdministration,
    value: (existing?.value ?? 0) + consumedValue,
  });
  return true;
}

function purchasesForUsed(used: Map<string, { product: IranMarketProductV2; units: number; value: number }>) {
  const purchases: WegovyContinuationProductPurchaseV2[] = [];
  for (const { product, units, value } of used.values()) {
    if (!positiveFinite(product.priceToman) || !positiveFinite(product.consumptionUnitsPerPurchaseUnit)) return undefined;
    const purchaseUnits = Math.ceil(units / product.consumptionUnitsPerPurchaseUnit - EPS);
    const purchasedUnits = purchaseUnits * product.consumptionUnitsPerPurchaseUnit;
    const leftover = Math.max(0, purchasedUnits - units);
    const unitValue = product.priceToman / product.consumptionUnitsPerPurchaseUnit;
    if ([purchaseUnits, purchasedUnits, leftover, unitValue, value].some((item) => !Number.isFinite(item) || item < 0)) return undefined;
    purchases.push({
      productId: product.productId,
      brandName: product.brandName,
      consumptionUnitsUsed: units,
      purchaseUnitsRequired: purchaseUnits,
      purchasedConsumptionUnits: purchasedUnits,
      leftoverConsumptionUnits: leftover,
      cashPurchaseCostToman: Math.round(purchaseUnits * product.priceToman),
      consumedDrugValueToman: Math.round(value),
      carryoverInventoryValueToman: Math.round(leftover * unitValue),
    });
  }
  return purchases;
}

/**
 * Builds a 30-day continuation cost window only after the clinical gate has
 * selected an exact product-bound WEGOVY dose plan. The calculator never decides
 * whether escalation is clinically allowed. For escalation windows it may show a
 * conditional label-schedule projection, but that projection is explicitly not a
 * ranking-grade cost authority because future tolerability is not yet observed.
 */
export function buildWegovyMashContinuationWindowCostV2(input: {
  request: DecisionGraphRequestV2;
  component: RegimenComponentV2;
  windowDays?: number;
}): WegovyMashContinuationWindowCostV2 | undefined {
  const { request, component } = input;
  const windowDays = input.windowDays ?? 30;
  if (!Number.isInteger(windowDays) || windowDays <= 0) return undefined;
  const selectedPlan = component.dosePlan;
  if (!selectedPlan?.ruleId.startsWith("LABEL-WEGOVY-MASH-") || selectedPlan.lane !== "liver") return undefined;

  const current = currentMedicationFor(request, component.masterDrugId);
  if (!current) return undefined;
  const interval = currentMedicationAdministrationIntervalV2(current);
  if (
    !interval ||
    interval.source !== "explicit_interval" ||
    interval.administrationsPerPeriod !== 1 ||
    interval.periodDays !== 7 ||
    interval.daysOnCurrentDose === undefined ||
    interval.therapyPhase === undefined ||
    interval.nextAdministrationInDays === undefined ||
    !Number.isInteger(interval.nextAdministrationInDays) ||
    interval.nextAdministrationInDays < 0 ||
    interval.nextAdministrationInDays >= 7
  ) return undefined;

  const currentStep = exactStepFromComponents(interval.perAdministrationDose);
  const selectedStep = exactStepFromComponents(selectedPlan.perAdministrationComponents);
  if (currentStep === undefined || selectedStep === undefined) return undefined;
  if (!selectedPlanMatchesClinicalContinuation({
    current,
    currentStep,
    selectedStep,
    daysOnCurrentDose: interval.daysOnCurrentDose,
    therapyPhase: interval.therapyPhase,
  })) return undefined;

  const selectedProduct = uniqueProductForStep({
    request,
    masterDrugId: component.masterDrugId,
    step: selectedStep,
    exactProductId: selectedPlan.productId,
  });
  if (!selectedProduct) return undefined;

  const stableMaintenance = selectedStep === 2.4 ||
    (selectedStep === 1.7 && interval.therapyPhase === "maintenance" && currentStep === 1.7);
  const costAuthority: WegovyMashContinuationWindowCostV2["costAuthority"] = stableMaintenance
    ? "executable"
    : "conditional_projection";

  const used = new Map<string, { product: IranMarketProductV2; units: number; value: number }>();
  const phaseMap = new Map<string, WegovyContinuationCostPhaseV2>();
  let step = selectedStep;
  let stageStartDay: number | undefined = selectedStep === currentStep ? 1 - interval.daysOnCurrentDose : undefined;
  const holdForLimitedTolerance = current.tolerance === "limited" && selectedStep === currentStep;

  for (let day = interval.nextAdministrationInDays + 1; day <= windowDays; day += 7) {
    if (stageStartDay === undefined) stageStartDay = day;
    const elapsedOnStep = day - stageStartDay;
    if (
      costAuthority === "conditional_projection" &&
      !holdForLimitedTolerance &&
      elapsedOnStep >= 28
    ) {
      const futureStep = nextStep(step);
      if (futureStep !== undefined) {
        step = futureStep;
        stageStartDay = day;
      }
    }

    const exactProductId = step === selectedStep ? selectedPlan.productId : undefined;
    const selected = uniqueProductForStep({ request, masterDrugId: component.masterDrugId, step, exactProductId });
    if (!selected || selected.rule.formula.kind !== "fixed_interval_components") return undefined;
    const desired = selected.rule.formula.componentsPerAdministration[0];
    if (!desired || !addAdministration({ used, phaseMap, product: selected.product, desired, step, day })) return undefined;
  }

  const phases = [...phaseMap.values()].sort((a, b) => a.firstAdministrationDay - b.firstAdministrationDay);
  if (!phases.length) return undefined;
  const productPurchases = purchasesForUsed(used);
  if (!productPurchases) return undefined;
  const totalAdministrations = phases.reduce((sum, phase) => sum + phase.administrationsInWindow, 0);
  const cashPurchaseCostToman = productPurchases.reduce((sum, item) => sum + item.cashPurchaseCostToman, 0);
  const normalizedTreatmentValueToman = productPurchases.reduce((sum, item) => sum + item.consumedDrugValueToman, 0);
  const carryoverInventoryValueToman = productPurchases.reduce((sum, item) => sum + item.carryoverInventoryValueToman, 0);
  if ([totalAdministrations, cashPurchaseCostToman, normalizedTreatmentValueToman, carryoverInventoryValueToman]
    .some((value) => !Number.isFinite(value) || value < 0)) return undefined;

  return {
    kind: "wegovy_mash_continuation_window",
    costAuthority,
    windowDays,
    scheduleSourceId: "US-LABEL-WEGOVY-2026-06",
    currentDoseMg: currentStep,
    selectedDoseMg: selectedStep,
    daysOnCurrentDose: interval.daysOnCurrentDose,
    nextAdministrationInDays: interval.nextAdministrationInDays,
    therapyPhase: interval.therapyPhase,
    projectionAssumption: costAuthority === "conditional_projection"
      ? "Future escalation inside this financial window assumes continued tolerability and label-consistent progression; it is display-only and must not drive clinical ranking."
      : undefined,
    phases,
    productPurchases,
    totalAdministrations,
    cashPurchaseCostToman,
    normalizedTreatmentValueToman,
    carryoverInventoryValueToman,
    insuranceProjection: "not_projected_continuation_claim_timing_required",
  };
}

export function attachWegovyMashContinuationCostV2(
  component: RegimenComponentV2,
  plan: WegovyMashContinuationWindowCostV2,
) {
  (component as ContinuationCostAwareRegimenComponentV2).wegovyContinuationCostPlan = plan;
}

export function wegovyMashContinuationCostV2(
  component: RegimenComponentV2,
): WegovyMashContinuationWindowCostV2 | undefined {
  return (component as ContinuationCostAwareRegimenComponentV2).wegovyContinuationCostPlan;
}

export function executableContinuationMonthlyCostV2(
  component: RegimenComponentV2,
): ProductMonthlyCostV2 | undefined {
  const plan = wegovyMashContinuationCostV2(component);
  const product = component.selectedProduct;
  if (!plan || plan.costAuthority !== "executable" || plan.windowDays !== 30 || !product || plan.productPurchases.length !== 1) return undefined;
  const purchase = plan.productPurchases[0]!;
  if (purchase.productId !== product.productId) return undefined;
  const containers = product.consumptionUnitsPerContainer
    ? Math.ceil(purchase.consumptionUnitsUsed / product.consumptionUnitsPerContainer - EPS)
    : undefined;
  return {
    productId: product.productId,
    brandName: product.brandName,
    dosageFormGroup: product.dosageFormGroup,
    doseFit: "exact",
    consumptionUnitsPerDay: purchase.consumptionUnitsUsed / 30,
    consumptionUnits30Days: purchase.consumptionUnitsUsed,
    containersNeeded30Days: containers,
    purchaseUnitsNeeded30Days: purchase.purchaseUnitsRequired,
    consumedDrugValueToman: purchase.consumedDrugValueToman,
    cashPurchaseCostToman: purchase.cashPurchaseCostToman,
    normalized30DayTreatmentCostToman: purchase.consumedDrugValueToman,
    leftoverConsumptionUnitsAfter30Days: purchase.leftoverConsumptionUnits,
    carryoverInventoryValueToman: purchase.carryoverInventoryValueToman,
    insurance: [],
  };
}
