import { buildReviewedProductDoseRulesV2 } from "./product-dose-rules.js";
import { buildCoreAda2026DecisionRulesV2 } from "./safety-rules.js";
import type {
  DoseRuleV2,
  EvidenceReferenceV2,
  KnowledgeMedicationV2,
  MedicationGateRuleV2,
} from "./types.js";

export interface DecisionGraphEvidenceIndexRecordV2 {
  ruleId: string;
  domain: "product_dose" | "medication_safety";
  textFa: string;
  textEn: string;
  engineEffect: string;
  searchText: string;
  evidence: EvidenceReferenceV2[];
}

function knowledge(
  masterDrugId: string,
  genericName: string,
  therapyGroup: string,
  routeOptions: string[] = ["oral"],
): KnowledgeMedicationV2 {
  return {
    masterDrugId,
    genericName,
    combination: false,
    therapeuticAreas: ["Diabetes"],
    therapyGroup,
    primaryLanes: ["glycemic"],
    routeOptions,
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightDirection: "neutral",
    effects: [],
    tags: [],
    evidence: [],
    engineState: "approved",
  };
}

/**
 * Deliberately minimal approved knowledge fixtures used only to materialize the
 * already-reviewed safety and product-dose rule registries for evidence search.
 * They do not enter patient assessment, ranking, market availability, or dosing
 * execution.
 */
const evidenceIndexKnowledgeV2: KnowledgeMedicationV2[] = [
  knowledge("EA-METFORMIN", "Metformin", "biguanide"),
  knowledge("EA-EMPAGLIFLOZIN", "Empagliflozin", "sglt2_inhibitor"),
  knowledge("EA-DAPAGLIFLOZIN", "Dapagliflozin", "sglt2_inhibitor"),
  knowledge("EA-SITAGLIPTIN", "Sitagliptin", "dpp4_inhibitor"),
  knowledge("EA-LINAGLIPTIN", "Linagliptin", "dpp4_inhibitor"),
  knowledge("EA-GLIMEPIRIDE", "Glimepiride", "sulfonylurea"),
  knowledge("EA-PIOGLITAZONE", "Pioglitazone", "thiazolidinedione"),
  knowledge("EA-LIRAGLUTIDE", "Liraglutide", "glp_1_receptor_agonist", ["subcutaneous"]),
  knowledge("EA-SEMAGLUTIDE-SC", "Semaglutide, subcutaneous", "glp_1_receptor_agonist", ["subcutaneous"]),
  knowledge("EA-DULAGLUTIDE", "Dulaglutide", "glp_1_receptor_agonist", ["subcutaneous"]),
  knowledge("EA-TIRZEPATIDE", "Tirzepatide", "dual_gip_glp_1_receptor_agonist", ["subcutaneous"]),
  knowledge("EA-TOUJEO", "Insulin glargine U-300", "basal_insulin_analog", ["subcutaneous"]),
  knowledge("EA-TRESIBA", "Insulin degludec", "basal_insulin_analog", ["subcutaneous"]),
];

const genericNameByMasterId = new Map(
  evidenceIndexKnowledgeV2.map((item) => [item.masterDrugId, item.genericName]),
);

function componentText(components: { ingredientKey: string; amount: number; unit: string }[]) {
  return components.map((item) => `${item.amount} ${item.unit} ${item.ingredientKey}`).join(" + ");
}

function doseFormulaText(rule: DoseRuleV2) {
  const formula = rule.formula;
  if (formula.kind === "fixed_daily_components") {
    return `${componentText(formula.dailyComponents)}; ${formula.administrationsPerDay} administration(s) per day`;
  }
  if (formula.kind === "fixed_interval_components") {
    return `${componentText(formula.componentsPerAdministration)}; ${formula.administrationsPerPeriod} administration(s) every ${formula.periodDays} day(s)`;
  }
  if (formula.kind === "weight_based_daily") {
    return `${formula.minPerKg}-${formula.maxPerKg} ${formula.unit}/kg/day; ${formula.administrationsPerDay} administration(s) per day`;
  }
  if (formula.kind === "presentation_units") {
    return `${formula.unitsPerAdministration} ${formula.unitLabel}; ${formula.administrationsPerDay} administration(s) per day`;
  }
  if (formula.kind === "prandial_initial") {
    return `${formula.fixedUnits} U or ${formula.fractionOfBasal * 100}% of basal at ${formula.meal}`;
  }
  return `FRC protocol ${formula.protocol}`;
}

function doseRecord(rule: DoseRuleV2): DecisionGraphEvidenceIndexRecordV2 {
  const genericName = genericNameByMasterId.get(rule.masterDrugId) ?? rule.masterDrugId;
  const formula = doseFormulaText(rule);
  const details = [
    rule.indication,
    formula,
    rule.targetDoseText,
    rule.maximumDoseText,
    rule.titration?.stepText,
    ...(rule.monitoring ?? []),
    ...rule.evidence.flatMap((item) => [item.sourceId, item.title, item.locator ?? ""]),
  ].filter(Boolean).join(" ");

  return {
    ruleId: rule.id,
    domain: "product_dose",
    textFa: `قانون دوز تاییدشده برای ${genericName}: ${formula}${rule.targetDoseText ? `؛ هدف/تیتراسیون: ${rule.targetDoseText}` : ""}`,
    textEn: `Approved dose rule for ${genericName}: ${formula}${rule.targetDoseText ? `; target/titration: ${rule.targetDoseText}` : ""}`,
    engineEffect: "approved_product_dose_rule",
    searchText: `${rule.id} ${genericName} ${details}`,
    evidence: [...rule.evidence],
  };
}

function safetyRecord(rule: MedicationGateRuleV2): DecisionGraphEvidenceIndexRecordV2 {
  const genericName = rule.masterDrugId
    ? genericNameByMasterId.get(rule.masterDrugId) ?? rule.masterDrugId
    : rule.therapyGroup ?? "medication";
  return {
    ruleId: rule.id,
    domain: "medication_safety",
    textFa: `قانون ایمنی تاییدشده برای ${genericName}: ${rule.reason}`,
    textEn: `Approved safety rule for ${genericName}: ${rule.reason}`,
    engineEffect: rule.effect === "exclude" ? "hard_exclusion" : "conditional_gate",
    searchText: `${rule.id} ${genericName} ${rule.reason} ${rule.effect} ${rule.evidence.flatMap((item) => [item.sourceId, item.title, item.locator ?? ""]).join(" ")}`,
    evidence: [...rule.evidence],
  };
}

/**
 * Evidence Assistant index materialized from the same approved executable rule
 * builders used by Decision Graph v2. This keeps citation retrieval tied to the
 * product/safety rules instead of maintaining an independent citation list.
 */
export function buildDecisionGraphEvidenceAssistantIndexV2(): DecisionGraphEvidenceIndexRecordV2[] {
  const doseRules = buildReviewedProductDoseRulesV2({ knowledge: evidenceIndexKnowledgeV2 });
  const safetyRules = buildCoreAda2026DecisionRulesV2(evidenceIndexKnowledgeV2).medicationGateRules;
  return [
    ...doseRules.map(doseRecord),
    ...safetyRules.map(safetyRecord),
  ];
}
