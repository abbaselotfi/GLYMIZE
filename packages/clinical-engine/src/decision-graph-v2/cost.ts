import { estimateInsuranceCostV2 } from "./insurance.js";
import type {
  ClinicianContextV2,
  DecisionPreferencesV2,
  GenericCostBenchmarkV2,
  InsurancePolicyRuleV2,
  IranMarketProductV2,
  ProductMonthlyCostV2,
  ResolvedDosePlanV2,
  StrengthComponentV2,
} from "./types.js";

const EPS = 1e-8;

function sameForm(product: IranMarketProductV2, dose: ResolvedDosePlanV2) {
  return !dose.dosageFormGroup || product.dosageFormGroup === dose.dosageFormGroup;
}

function ratioForComponents(
  desiredComponents: readonly StrengthComponentV2[],
  product: IranMarketProductV2,
): number | undefined {
  const ratios: number[] = [];
  for (const desired of desiredComponents) {
    const strength = product.strengthComponents.find((item) =>
      item.ingredientKey === desired.ingredientKey && item.unit.toLocaleLowerCase() === desired.unit.toLocaleLowerCase(),
    );
    if (!strength || strength.amount <= 0) return undefined;
    ratios.push(desired.amount / strength.amount);
  }
  if (!ratios.length) return undefined;
  const uIndex = desiredComponents.findIndex((item) => item.unit.toLocaleLowerCase() === "u");
  const anchor = ratios[uIndex >= 0 ? uIndex : 0]!;
  const injectionTolerance = product.dosageFormGroup.startsWith("injection") || product.dosageFormGroup === "prefilled_syringe" ? 0.02 : 0;
  const compatible = ratios.every((ratio) => {
    const delta = Math.abs(ratio - anchor);
    if (delta <= EPS) return true;
    return injectionTolerance > 0 && delta / Math.max(Math.abs(anchor), EPS) <= injectionTolerance;
  });
  if (!compatible || anchor <= 0) return undefined;
  return anchor;
}

function requiresWholeConsumptionUnits(product: IranMarketProductV2) {
  return ["tablet", "capsule"].includes(product.consumptionUnit.toLocaleLowerCase());
}

function nearInteger(value: number) {
  return Math.abs(value - Math.round(value)) <= EPS;
}

function unitsPerDayForProduct(product: IranMarketProductV2, dose: ResolvedDosePlanV2): number | undefined {
  if (!sameForm(product, dose)) return undefined;
  if (dose.presentationUnitsPerDay !== undefined) return dose.presentationUnitsPerDay;

  // Per-administration matching prevents a 1000 mg tablet from being silently
  // interpreted as a valid 500 mg twice-daily starting presentation.
  if (dose.perAdministrationComponents?.length) {
    const perAdministration = ratioForComponents(dose.perAdministrationComponents, product);
    if (perAdministration === undefined) return undefined;
    if (requiresWholeConsumptionUnits(product) && !nearInteger(perAdministration)) return undefined;
    return perAdministration * dose.administrationsPerDay;
  }

  if (!dose.dailyComponents?.length) return undefined;
  const daily = ratioForComponents(dose.dailyComponents, product);
  if (daily === undefined) return undefined;
  if (requiresWholeConsumptionUnits(product) && !nearInteger(daily)) return undefined;
  return daily;
}

export function calculateProductMonthlyCostV2(input: {
  product: IranMarketProductV2;
  dose: ResolvedDosePlanV2;
  insurancePolicies: readonly InsurancePolicyRuleV2[];
  preferences: DecisionPreferencesV2;
  clinician?: ClinicianContextV2;
}): ProductMonthlyCostV2 | undefined {
  const { product, dose, insurancePolicies, preferences, clinician } = input;
  if (product.priceToman === undefined || product.consumptionUnitsPerPurchaseUnit <= 0) return undefined;
  const perDay = unitsPerDayForProduct(product, dose);
  if (perDay === undefined) return undefined;
  const total30 = perDay * 30;
  const purchaseUnits = Math.ceil(total30 / product.consumptionUnitsPerPurchaseUnit - EPS);
  const containers = product.consumptionUnitsPerContainer
    ? Math.ceil(total30 / product.consumptionUnitsPerContainer - EPS)
    : undefined;
  const providers = preferences.insuranceProviders ?? [];
  const pricePerConsumptionUnit = product.priceToman / product.consumptionUnitsPerPurchaseUnit;
  const purchasedConsumptionUnits = purchaseUnits * product.consumptionUnitsPerPurchaseUnit;
  const leftover = Math.max(0, purchasedConsumptionUnits - total30);

  const consumedValue = Math.round(total30 * pricePerConsumptionUnit);

  return {
    productId: product.productId,
    brandName: product.brandName,
    dosageFormGroup: product.dosageFormGroup,
    doseFit: "exact",
    consumptionUnitsPerDay: perDay,
    consumptionUnits30Days: total30,
    containersNeeded30Days: containers,
    purchaseUnitsNeeded30Days: purchaseUnits,
    consumedDrugValueToman: consumedValue,
    cashPurchaseCostToman: Math.round(purchaseUnits * product.priceToman),
    normalized30DayTreatmentCostToman: consumedValue,
    leftoverConsumptionUnitsAfter30Days: leftover,
    carryoverInventoryValueToman: Math.round(leftover * pricePerConsumptionUnit),
    insurance: estimateInsuranceCostV2({
      product,
      purchaseUnitsNeeded30Days: purchaseUnits,
      providers,
      policies: insurancePolicies,
      clinician,
    }),
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function chooseGenericCostBenchmarkV2(input: {
  masterDrugId: string;
  productCosts: readonly ProductMonthlyCostV2[];
  products: readonly IranMarketProductV2[];
  preferences: DecisionPreferencesV2;
}): GenericCostBenchmarkV2 | undefined {
  const { masterDrugId, productCosts, products, preferences } = input;
  const currentProducts = products.filter((product) =>
    product.masterDrugId === masterDrugId &&
    product.nfiMatchState === "verified" &&
    product.license.currentValid &&
    !product.license.revoked &&
    (product.marketPresence === "confirmed_active" || product.marketPresence === "recently_observed"),
  );
  const currentIds = new Set(currentProducts.map((product) => product.productId));
  const comparable = productCosts.filter((cost) => currentIds.has(cost.productId));
  if (!comparable.length) return undefined;

  const values = comparable.map((item) => item.cashPurchaseCostToman);
  const normalizedValues = comparable.map((item) => item.normalized30DayTreatmentCostToman);
  const base = {
    lowestMonthlyCashCostToman: Math.min(...values),
    highestMonthlyCashCostToman: Math.max(...values),
    medianMonthlyCashCostToman: Math.round(median(values)),
    lowestNormalized30DayCostToman: Math.min(...normalizedValues),
    highestNormalized30DayCostToman: Math.max(...normalizedValues),
    medianNormalized30DayCostToman: Math.round(median(normalizedValues)),
    comparableProductIds: comparable.map((item) => item.productId),
  };

  const preferredId = preferences.adminPreferredProductByMasterDrugId?.[masterDrugId];
  if (preferredId) {
    const preferred = comparable.find((item) => item.productId === preferredId);
    if (preferred) {
      return {
        ...base,
        basis: "admin_preferred",
        referenceMonthlyCashCostToman: preferred.cashPurchaseCostToman,
        referenceNormalized30DayCostToman: preferred.normalized30DayTreatmentCostToman,
        referenceProductId: preferred.productId,
        referenceBrandName: preferred.brandName,
      };
    }
  }

  const genericReference = currentProducts.find((product) => product.brandName === undefined && product.priceToman !== undefined);
  if (genericReference) {
    const refCost = comparable.find((item) => item.productId === genericReference.productId);
    if (refCost) {
      return {
        ...base,
        basis: "generic_reference",
        referenceMonthlyCashCostToman: refCost.cashPurchaseCostToman,
        referenceNormalized30DayCostToman: refCost.normalized30DayTreatmentCostToman,
        referenceProductId: refCost.productId,
      };
    }
  }

  if (comparable.length === 1) {
    const only = comparable[0]!;
    return {
      ...base,
      basis: "single_current_market",
      referenceMonthlyCashCostToman: only.cashPurchaseCostToman,
      referenceNormalized30DayCostToman: only.normalized30DayTreatmentCostToman,
      referenceProductId: only.productId,
      referenceBrandName: only.brandName,
    };
  }

  const med = Math.round(median(values));
  const normalizedMed = Math.round(median(normalizedValues));
  const nearest = [...comparable].sort((a, b) => Math.abs(a.normalized30DayTreatmentCostToman - normalizedMed) - Math.abs(b.normalized30DayTreatmentCostToman - normalizedMed))[0]!;
  return {
    ...base,
    basis: "median_current_market",
    referenceMonthlyCashCostToman: med,
    referenceNormalized30DayCostToman: normalizedMed,
    referenceProductId: nearest.productId,
    referenceBrandName: nearest.brandName,
  };
}
