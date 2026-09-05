import type {
  DecisionGraphRequestV2,
  DoseRuleV2,
  IranMarketProductV2,
  RegimenComponentV2,
  StrengthComponentV2,
} from "./types.js";

const EPS = 1e-8;
const WEGOVY_STEPS_MG = [0.25, 0.5, 1, 1.7, 2.4] as const;

type WegovyStepMgV2 = (typeof WEGOVY_STEPS_MG)[number];

export interface TitrationCostPhaseV2 {
  doseMg: WegovyStepMgV2;
  startDay: number;
  endDay: number;
  administrationsInWindow: number;
  productId: string;
  brandName?: string;
  consumptionUnitsUsed: number;
  consumedDrugValueToman: number;
}

export interface TitrationProductPurchaseV2 {
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

export interface WegovyMashTitrationCostPlanV2 {
  kind: "wegovy_mash_label_escalation";
  windowDays: number;
  scheduleSourceId: "US-LABEL-WEGOVY-2026-06";
  phases: TitrationCostPhaseV2[];
  productPurchases: TitrationProductPurchaseV2[];
  totalAdministrations: number;
  cashPurchaseCostToman: number;
  normalizedTreatmentValueToman: number;
  carryoverInventoryValueToman: number;
  insuranceProjection: "not_projected_phase_claim_timing_required";
}

export type PhaseAwareRegimenComponentV2 = RegimenComponentV2 & {
  titrationCostPlan?: WegovyMashTitrationCostPlanV2;
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

function currentVerifiedWegovy(product: IranMarketProductV2, masterDrugId: string) {
  return product.masterDrugId === masterDrugId &&
    normalized(product.brandName) === "wegovy" &&
    normalized(product.route).includes("subcutaneous") &&
    product.nfiMatchState === "verified" &&
    product.license.currentValid &&
    !product.license.revoked &&
    (product.marketPresence === "confirmed_active" || product.marketPresence === "recently_observed");
}

function exactStepFromRule(rule: DoseRuleV2): WegovyStepMgV2 | undefined {
  if (
    rule.reviewState !== "approved" ||
    rule.lane !== "liver" ||
    !rule.id.startsWith("LABEL-WEGOVY-MASH-") ||
    !rule.productId ||
    rule.formula.kind !== "fixed_interval_components" ||
    rule.formula.administrationsPerPeriod !== 1 ||
    rule.formula.periodDays !== 7 ||
    rule.formula.componentsPerAdministration.length !== 1
  ) return undefined;
  const component = rule.formula.componentsPerAdministration[0];
  if (!component || normalized(component.unit) !== "mg") return undefined;
  return WEGOVY_STEPS_MG.includes(component.amount as WegovyStepMgV2)
    ? component.amount as WegovyStepMgV2
    : undefined;
}

function productUnitsPerAdministration(
  desired: StrengthComponentV2,
  product: IranMarketProductV2,
) {
  const strength = product.strengthComponents.find((item) =>
    item.ingredientKey === desired.ingredientKey && normalized(item.unit) === normalized(desired.unit),
  );
  if (!strength || !positiveFinite(strength.amount)) return undefined;
  const ratio = desired.amount / strength.amount;
  return positiveFinite(ratio) ? ratio : undefined;
}

function administrationsForPhase(startDay: number, endDay: number, windowDays: number) {
  if (startDay > windowDays) return 0;
  const lastDay = Math.min(endDay, windowDays);
  if (lastDay < startDay) return 0;
  return Math.floor((lastDay - startDay) / 7) + 1;
}

function checkedRound(value: number) {
  return Math.round(value);
}

/**
 * Builds the zero-inventory treatment-window cost of the reviewed WEGOVY MASH
 * escalation. It uses the same approved product-bound Dose Rules as execution.
 * The first four phases are exactly 28 days; 2.4 mg is the maintenance phase and
 * continues for the remainder of the requested window.
 *
 * Insurance is intentionally not projected here: multi-strength claim timing,
 * per-product limits and carryover require a separate claims-aware calculation.
 */
export function buildWegovyMashInitiationTitrationCostV2(input: {
  request: DecisionGraphRequestV2;
  component: RegimenComponentV2;
  windowDays?: number;
}): WegovyMashTitrationCostPlanV2 | undefined {
  const { request, component } = input;
  const windowDays = input.windowDays ?? 30;
  if (!Number.isInteger(windowDays) || windowDays <= 0) return undefined;
  if (component.dosePlan?.lane !== "liver" || !component.dosePlan.ruleId.startsWith("LABEL-WEGOVY-MASH-INIT-0_25:")) {
    return undefined;
  }

  const rulesByStep = new Map<WegovyStepMgV2, DoseRuleV2[]>();
  for (const rule of request.inventory.doseRules) {
    if (rule.masterDrugId !== component.masterDrugId) continue;
    const step = exactStepFromRule(rule);
    if (step === undefined) continue;
    rulesByStep.set(step, [...(rulesByStep.get(step) ?? []), rule]);
  }

  const selected: Array<{ step: WegovyStepMgV2; rule: DoseRuleV2; product: IranMarketProductV2 }> = [];
  for (const step of WEGOVY_STEPS_MG) {
    const candidates = (rulesByStep.get(step) ?? []).flatMap((rule) => {
      const product = request.inventory.marketProducts.find((item) =>
        item.productId === rule.productId && currentVerifiedWegovy(item, component.masterDrugId),
      );
      return product ? [{ step, rule, product }] : [];
    });
    // Never choose arbitrarily between multiple current product-bound presentations
    // for the same WEGOVY strength.
    if (candidates.length !== 1) return undefined;
    selected.push(candidates[0]!);
  }

  const phases: TitrationCostPhaseV2[] = [];
  const usedByProduct = new Map<string, { product: IranMarketProductV2; units: number; value: number }>();

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index]!;
    const startDay = index * 28 + 1;
    const endDay = index < selected.length - 1 ? startDay + 27 : windowDays;
    const administrations = administrationsForPhase(startDay, endDay, windowDays);
    if (!administrations) continue;

    if (
      !positiveFinite(item.product.priceToman) ||
      !positiveFinite(item.product.consumptionUnitsPerPurchaseUnit) ||
      item.rule.formula.kind !== "fixed_interval_components"
    ) return undefined;
    const desired = item.rule.formula.componentsPerAdministration[0];
    if (!desired) return undefined;
    const unitsPerAdministration = productUnitsPerAdministration(desired, item.product);
    if (!positiveFinite(unitsPerAdministration)) return undefined;
    const units = administrations * unitsPerAdministration;
    const pricePerConsumptionUnit = item.product.priceToman / item.product.consumptionUnitsPerPurchaseUnit;
    const consumedValue = units * pricePerConsumptionUnit;
    if (![units, pricePerConsumptionUnit, consumedValue].every((value) => Number.isFinite(value) && value >= 0)) return undefined;

    phases.push({
      doseMg: item.step,
      startDay,
      endDay: Math.min(endDay, windowDays),
      administrationsInWindow: administrations,
      productId: item.product.productId,
      brandName: item.product.brandName,
      consumptionUnitsUsed: units,
      consumedDrugValueToman: checkedRound(consumedValue),
    });
    const existing = usedByProduct.get(item.product.productId);
    usedByProduct.set(item.product.productId, {
      product: item.product,
      units: (existing?.units ?? 0) + units,
      value: (existing?.value ?? 0) + consumedValue,
    });
  }

  if (!phases.length) return undefined;
  const productPurchases: TitrationProductPurchaseV2[] = [];
  for (const { product, units, value } of usedByProduct.values()) {
    if (!positiveFinite(product.priceToman) || !positiveFinite(product.consumptionUnitsPerPurchaseUnit)) return undefined;
    const purchaseUnits = Math.ceil(units / product.consumptionUnitsPerPurchaseUnit - EPS);
    const purchasedUnits = purchaseUnits * product.consumptionUnitsPerPurchaseUnit;
    const leftover = Math.max(0, purchasedUnits - units);
    const unitValue = product.priceToman / product.consumptionUnitsPerPurchaseUnit;
    const values = [purchaseUnits, purchasedUnits, leftover, unitValue, value];
    if (values.some((item) => !Number.isFinite(item) || item < 0)) return undefined;
    productPurchases.push({
      productId: product.productId,
      brandName: product.brandName,
      consumptionUnitsUsed: units,
      purchaseUnitsRequired: purchaseUnits,
      purchasedConsumptionUnits: purchasedUnits,
      leftoverConsumptionUnits: leftover,
      cashPurchaseCostToman: checkedRound(purchaseUnits * product.priceToman),
      consumedDrugValueToman: checkedRound(value),
      carryoverInventoryValueToman: checkedRound(leftover * unitValue),
    });
  }

  const totalAdministrations = phases.reduce((sum, phase) => sum + phase.administrationsInWindow, 0);
  const cashPurchaseCostToman = productPurchases.reduce((sum, item) => sum + item.cashPurchaseCostToman, 0);
  const normalizedTreatmentValueToman = productPurchases.reduce((sum, item) => sum + item.consumedDrugValueToman, 0);
  const carryoverInventoryValueToman = productPurchases.reduce((sum, item) => sum + item.carryoverInventoryValueToman, 0);
  if ([totalAdministrations, cashPurchaseCostToman, normalizedTreatmentValueToman, carryoverInventoryValueToman]
    .some((value) => !Number.isFinite(value) || value < 0)) return undefined;

  return {
    kind: "wegovy_mash_label_escalation",
    windowDays,
    scheduleSourceId: "US-LABEL-WEGOVY-2026-06",
    phases,
    productPurchases,
    totalAdministrations,
    cashPurchaseCostToman,
    normalizedTreatmentValueToman,
    carryoverInventoryValueToman,
    insuranceProjection: "not_projected_phase_claim_timing_required",
  };
}

export function attachPhaseAwareTitrationCostV2(
  component: RegimenComponentV2,
  plan: WegovyMashTitrationCostPlanV2,
) {
  (component as PhaseAwareRegimenComponentV2).titrationCostPlan = plan;
}

export function phaseAwareTitrationCostV2(
  component: RegimenComponentV2,
): WegovyMashTitrationCostPlanV2 | undefined {
  return (component as PhaseAwareRegimenComponentV2).titrationCostPlan;
}
