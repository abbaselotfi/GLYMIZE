import type {
  DecisionGraphInventoryV2,
  DoseRuleV2,
  EvidenceReferenceV2,
  FrcProductProtocolBindingV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
} from "./types.js";

export const soliquaUs2026EvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-SOLIQUA-2026",
  title: "SOLIQUA 100/33 (insulin glargine/lixisenatide) — U.S. Prescribing Information",
  version: "2026-03",
  url: "https://products.sanofi.us/soliqua100-33/soliqua100-33.pdf",
  locator: "Dosage and Administration 2.1-2.3",
  strength: "regulatory_label",
};

export const suliquaEuEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "EU-LABEL-SULIQUA",
  title: "Suliqua (insulin glargine/lixisenatide) — EU Product Information",
  url: "https://www.ema.europa.eu/en/medicines/human/EPAR/suliqua",
  locator: "Product information and two-pen dosing table",
  strength: "regulatory_label",
};

export const xultophyUs2026EvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-XULTOPHY-2026",
  title: "XULTOPHY 100/3.6 (insulin degludec/liraglutide) — U.S. Prescribing Information",
  version: "2026",
  url: "https://www.novo-pi.com/xultophy10036.pdf",
  locator: "Dosage and Administration 2.2-2.3",
  strength: "regulatory_label",
};

export interface FrcBindingBuildIssueV2 {
  productId: string;
  code: "FRC_PROTOCOL_UNBOUND" | "FRC_PROTOCOL_COMPOSITION_MISMATCH";
  message: string;
}

function normalized(value: string | undefined) {
  return (value ?? "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function medicationById(knowledge: readonly KnowledgeMedicationV2[], id: string) {
  return knowledge.find((item) => item.masterDrugId === id);
}

function componentAmount(
  product: IranMarketProductV2,
  knowledge: readonly KnowledgeMedicationV2[],
  matcher: RegExp,
  unit: string,
) {
  const component = product.strengthComponents.find((item) => {
    const medication = medicationById(knowledge, item.ingredientKey);
    return Boolean(medication && matcher.test(normalized(medication.genericName)) && item.unit.toLocaleLowerCase() === unit.toLocaleLowerCase());
  });
  return component?.amount;
}

function approx(value: number | undefined, target: number, tolerance: number) {
  return value !== undefined && Math.abs(value - target) <= tolerance;
}

/**
 * Auto-binds only exact, recognizable branded FRC presentations whose normalized
 * composition agrees with the regulatory product. Generic/unbranded FRC rows are
 * intentionally left unbound for admin/clinical review rather than guessed.
 */
export function buildAutoFrcProtocolBindingsV2(inventory: Pick<DecisionGraphInventoryV2, "knowledge" | "marketProducts">): {
  bindings: FrcProductProtocolBindingV2[];
  issues: FrcBindingBuildIssueV2[];
} {
  const bindings: FrcProductProtocolBindingV2[] = [];
  const issues: FrcBindingBuildIssueV2[] = [];

  for (const product of inventory.marketProducts.filter((item) => item.nfiMatchState === "verified")) {
    const medication = product.masterDrugId ? medicationById(inventory.knowledge, product.masterDrugId) : undefined;
    if (!medication || medication.therapyGroup !== "fixed_ratio_combination") continue;
    const brand = normalized(product.brandName ?? product.genericName);

    const glargine = componentAmount(product, inventory.knowledge, /insulin glargine/, "U");
    const lixisenatide = componentAmount(product, inventory.knowledge, /lixisenatide/, "mcg");
    const degludec = componentAmount(product, inventory.knowledge, /insulin degludec/, "U");
    const liraglutideMg = componentAmount(product, inventory.knowledge, /liraglutide/, "mg");

    if (/\bsoliqua\b/.test(brand)) {
      if (approx(glargine, 100, 1) && approx(lixisenatide, 33, 1.5)) {
        bindings.push({ id: `AUTO-FRC:${product.productId}:SOLIQUA-US`, productId: product.productId, masterDrugId: medication.masterDrugId, protocol: "soliqua_us_100_33", evidence: [soliquaUs2026EvidenceV2], reviewState: "approved" });
      } else {
        issues.push({ productId: product.productId, code: "FRC_PROTOCOL_COMPOSITION_MISMATCH", message: "SOLIQUA brand token was present but normalized strength did not match 100 U/mL insulin glargine + approximately 33 mcg/mL lixisenatide." });
      }
      continue;
    }

    if (/\bsuliqua\b/.test(brand)) {
      if (approx(glargine, 100, 1) && approx(lixisenatide, 50, 1.5)) {
        bindings.push({ id: `AUTO-FRC:${product.productId}:SULIQUA-EU-100-50`, productId: product.productId, masterDrugId: medication.masterDrugId, protocol: "suliqua_eu_100_50", evidence: [suliquaEuEvidenceV2], reviewState: "approved" });
      } else if (approx(glargine, 100, 1) && approx(lixisenatide, 33, 1.5)) {
        bindings.push({ id: `AUTO-FRC:${product.productId}:SULIQUA-EU-100-33`, productId: product.productId, masterDrugId: medication.masterDrugId, protocol: "suliqua_eu_100_33", evidence: [suliquaEuEvidenceV2], reviewState: "approved" });
      } else {
        issues.push({ productId: product.productId, code: "FRC_PROTOCOL_COMPOSITION_MISMATCH", message: "SULIQUA brand token was present but the exact 100/50 or 100/33 composition could not be verified." });
      }
      continue;
    }

    if (/\bxultophy\b/.test(brand)) {
      if (approx(degludec, 100, 1) && approx(liraglutideMg, 3.6, 0.05)) {
        bindings.push({ id: `AUTO-FRC:${product.productId}:XULTOPHY-US`, productId: product.productId, masterDrugId: medication.masterDrugId, protocol: "xultophy_us_100_3_6", evidence: [xultophyUs2026EvidenceV2], reviewState: "approved" });
      } else {
        issues.push({ productId: product.productId, code: "FRC_PROTOCOL_COMPOSITION_MISMATCH", message: "XULTOPHY brand token was present but normalized strength did not match 100 U/mL insulin degludec + 3.6 mg/mL liraglutide." });
      }
      continue;
    }

    issues.push({ productId: product.productId, code: "FRC_PROTOCOL_UNBOUND", message: "FRC product has no reviewed label binding; dosing remains non-executable until the exact NFI presentation is bound to a regulatory protocol." });
  }

  return { bindings, issues };
}

function componentKeys(medication: KnowledgeMedicationV2, knowledge: readonly KnowledgeMedicationV2[]) {
  const components = (medication.componentMasterDrugIds ?? []).map((id) => medicationById(knowledge, id)).filter((item): item is KnowledgeMedicationV2 => Boolean(item));
  const insulin = components.find((item) => /insulin/.test(normalized(item.genericName)));
  const incretin = components.find((item) => /lixisenatide|liraglutide/.test(normalized(item.genericName)));
  return insulin && incretin ? { insulin: insulin.masterDrugId, incretin: incretin.masterDrugId } : undefined;
}

export function buildReviewedFrcDoseRulesV2(inventory: Pick<DecisionGraphInventoryV2, "knowledge" | "frcProtocolBindings">): DoseRuleV2[] {
  const rules: DoseRuleV2[] = [];
  for (const binding of (inventory.frcProtocolBindings ?? []).filter((item) => item.reviewState === "approved")) {
    const medication = medicationById(inventory.knowledge, binding.masterDrugId);
    if (!medication || medication.engineState !== "approved" || medication.therapyGroup !== "fixed_ratio_combination") continue;
    const keys = componentKeys(medication, inventory.knowledge);
    if (!keys) continue;
    rules.push({
      id: `LABEL-FRC-START:${binding.protocol}:${binding.productId}`,
      masterDrugId: binding.masterDrugId,
      productId: binding.productId,
      indication: "Type 2 diabetes — product-specific fixed-ratio combination initiation/intensification",
      dosageFormGroup: "injection_pen",
      selectionRole: "product_specific",
      useCase: "initiation",
      formula: { kind: "frc_initial", protocol: binding.protocol, insulinIngredientKey: keys.insulin, incretinIngredientKey: keys.incretin },
      monitoring: ["fasting glucose", "hypoglycemia", "gastrointestinal tolerability", "renal function when clinically indicated", "avoid duplicate GLP-1-based therapy"],
      evidence: binding.evidence,
      reviewState: "approved",
    });
  }
  return rules;
}
