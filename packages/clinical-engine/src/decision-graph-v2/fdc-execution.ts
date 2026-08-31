import type {
  DecisionGraphRequestV2,
  KnowledgeMedicationV2,
  ResolvedDosePlanV2,
  StrengthComponentV2,
} from "./types.js";

const EPS = 1e-8;

function activeCurrent(request: DecisionGraphRequestV2) {
  return (request.patient.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active");
}

function currentComponentDose(request: DecisionGraphRequestV2, masterDrugId: string) {
  const current = activeCurrent(request).find((item) => item.masterDrugId === masterDrugId);
  if (!current?.dailyDose?.length || !current.administrationsPerDay || current.administrationsPerDay <= 0) return undefined;
  const own = current.dailyDose.find((item) => item.ingredientKey === masterDrugId) ?? current.dailyDose[0];
  if (!own || !(own.amount > 0)) return undefined;
  return {
    daily: { ingredientKey: masterDrugId, amount: own.amount, unit: own.unit } satisfies StrengthComponentV2,
    perAdministration: { ingredientKey: masterDrugId, amount: own.amount / current.administrationsPerDay, unit: own.unit } satisfies StrengthComponentV2,
    administrationsPerDay: current.administrationsPerDay,
  };
}

function exactProductRatio(perAdministration: readonly StrengthComponentV2[], productStrength: readonly StrengthComponentV2[]) {
  const ratios: number[] = [];
  for (const desired of perAdministration) {
    const strength = productStrength.find((item) => item.ingredientKey === desired.ingredientKey && item.unit.toLocaleLowerCase() === desired.unit.toLocaleLowerCase());
    if (!strength || strength.amount <= 0) return undefined;
    ratios.push(desired.amount / strength.amount);
  }
  if (!ratios.length) return undefined;
  const first = ratios[0]!;
  if (ratios.some((item) => Math.abs(item - first) > EPS)) return undefined;
  if (Math.abs(first - Math.round(first)) > EPS || first <= 0) return undefined;
  return Math.round(first);
}

/**
 * Finds an exact fixed-dose-combination presentation that reproduces an existing
 * component regimen without changing active-ingredient dose. This is a regimen
 * simplification path, not a de-novo dosing recommendation.
 */
export function resolveExactCurrentRegimenFdcPlansV2(
  request: DecisionGraphRequestV2,
  medication: KnowledgeMedicationV2,
): ResolvedDosePlanV2[] {
  if (!medication.combination || medication.therapyGroup === "fixed_ratio_combination") return [];
  const componentIds = medication.componentMasterDrugIds ?? [];
  if (componentIds.length < 2) return [];
  const current = componentIds.map((id) => currentComponentDose(request, id));
  if (current.some((item) => !item)) return [];
  const resolved = current as NonNullable<(typeof current)[number]>[];
  const frequencies = [...new Set(resolved.map((item) => item.administrationsPerDay))];
  if (frequencies.length !== 1) return [];
  const administrationsPerDay = frequencies[0]!;
  const dailyComponents = resolved.map((item) => item.daily);
  const perAdministrationComponents = resolved.map((item) => item.perAdministration);

  return request.inventory.marketProducts
    .filter((product) =>
      product.masterDrugId === medication.masterDrugId &&
      product.nfiMatchState === "verified" &&
      product.license.currentValid &&
      !product.license.revoked &&
      (product.marketPresence === "confirmed_active" || product.marketPresence === "recently_observed") &&
      ["tablet", "extended_release_tablet", "capsule"].includes(product.dosageFormGroup),
    )
    .flatMap((product): ResolvedDosePlanV2[] => {
      const units = exactProductRatio(perAdministrationComponents, product.strengthComponents);
      if (!units) return [];
      return [{
        ruleId: `FDC-EXACT-CURRENT-REGIMEN:${product.productId}`,
        masterDrugId: medication.masterDrugId,
        productId: product.productId,
        dosageFormGroup: product.dosageFormGroup,
        selectionRole: "product_specific",
        useCase: "continuation",
        dailyComponents,
        perAdministrationComponents,
        administrationsPerDay,
        presentationUnitsPerDay: units * administrationsPerDay,
        consumptionUnitHint: product.consumptionUnit,
        displayStartDose: `${units} ${product.consumptionUnit} × ${administrationsPerDay}/day; exact same active-ingredient doses as the documented current component regimen`,
        titrationText: "No dose escalation is inferred. This plan only simplifies an already documented component regimen into an exact-dose FDC presentation.",
        monitoring: ["confirm component doses", "confirm formulation equivalence", "confirm patient tolerance before switch"],
        evidence: medication.evidence,
        clinicianConfirmationRequired: true,
      }];
    });
}
