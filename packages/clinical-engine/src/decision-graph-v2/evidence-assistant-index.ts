import { buildReviewedProductDoseRulesV2 } from "./product-dose-rules.js";
import {
  buildReviewedCardiometabolicDoseRulesV2,
  buildReviewedCardiometabolicGateRulesV2,
} from "./cardiometabolic-protocols.js";
import { buildReviewedMashDoseRulesV2 } from "./mash-protocols.js";
import {
  applyReviewedWegovyMashKnowledgeV2,
  buildReviewedWegovyMashDoseRulesV2,
  wegovy2026LabelEvidenceV2,
} from "./wegovy-mash-protocol.js";
import {
  applyReviewedPainfulDpnKnowledgeV2,
  buildReviewedPainfulDpnDoseRulesV2,
  buildReviewedPainfulDpnGateRulesV2,
} from "./painful-dpn-protocol.js";
import { buildCoreAda2026DecisionRulesV2 } from "./safety-rules.js";
import type {
  DoseRuleV2,
  EvidenceReferenceV2,
  IranMarketProductV2,
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
  knowledge("EA-ENALAPRIL", "Enalapril", "raas_blocker"),
  knowledge("EA-LOSARTAN", "Losartan", "raas_blocker"),
  knowledge("EA-VALSARTAN", "Valsartan", "raas_blocker"),
  knowledge("EA-ATORVASTATIN", "Atorvastatin", "lipid_lowering"),
  knowledge("EA-ROSUVASTATIN", "Rosuvastatin", "lipid_lowering"),
  knowledge("EA-FINERENONE", "Finerenone", "mineralocorticoid_receptor_antagonist"),
  knowledge("EA-SPIRONOLACTONE", "Spironolactone", "mineralocorticoid_receptor_antagonist"),
  {
    ...knowledge("EA-RESMETIROM", "Resmetirom", "liver_directed_therapy"),
    therapeuticAreas: ["MASH"],
    primaryLanes: ["liver"],
    efficacyBand: "none",
    hypoglycemiaRisk: "minimal",
  },
  {
    ...knowledge("EA-PREGABALIN", "Pregabalin", "other"),
    therapeuticAreas: ["Neuropathy"],
    primaryLanes: [],
    efficacyBand: "none",
    hypoglycemiaRisk: "minimal",
    engineState: "review_required",
  },
  {
    ...knowledge("EA-DULOXETINE", "Duloxetine", "other"),
    therapeuticAreas: ["Neuropathy"],
    primaryLanes: [],
    efficacyBand: "none",
    hypoglycemiaRisk: "minimal",
    engineState: "review_required",
  },
];

const evidenceIndexWegovyProductsV2: IranMarketProductV2[] = [0.25, 0.5, 1, 1.7, 2.4].map((amount) => ({
  productId: `EA-WEGOVY-${String(amount).replace(".", "_")}`,
  masterDrugId: "EA-SEMAGLUTIDE-SC",
  nfiMatchState: "verified",
  genericName: "Semaglutide",
  brandName: "Wegovy",
  dosageFormGroup: "injection_pen",
  route: "subcutaneous",
  consumptionUnit: "pen",
  strengthComponents: [{ ingredientKey: "EA-SEMAGLUTIDE-SC", amount, unit: "mg" }],
  consumptionUnitsPerPurchaseUnit: 4,
  purchaseUnitLabel: "box",
  license: { everValid: true, currentValid: true, revoked: false },
  marketPresence: "confirmed_active",
  observedAt: "evidence-index-fixture",
}));

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

const wegovyMashSafetyEvidenceRecordV2: DecisionGraphEvidenceIndexRecordV2 = {
  ruleId: "LABEL-WEGOVY-MASH-SAFETY-BOUNDARY",
  domain: "medication_safety",
  textFa: "اجرای WEGOVY برای MASH به غربالگری contraindication و warningهای label از جمله MTC/MEN2، hypersensitivity شدید، severe gastroparesis، pancreatitis و عدم همزمانی با semaglutide/GLP-1 دیگر نیاز دارد.",
  textEn: "WEGOVY MASH execution requires label safety screening including MTC/MEN2, serious hypersensitivity, severe gastroparesis, pancreatitis review, and avoidance of concomitant semaglutide/other GLP-1 therapy.",
  engineEffect: "product_specific_safety_boundary",
  searchText: "wegovy semaglutide contraindication mtc medullary thyroid carcinoma men2 hypersensitivity gastroparesis pancreatitis concomitant glp-1",
  evidence: [wegovy2026LabelEvidenceV2],
};

/**
 * Evidence Assistant index materialized from the same approved executable rule
 * builders used by Decision Graph v2. This keeps citation retrieval tied to the
 * product/safety rules instead of maintaining an independent citation list.
 */
export function buildDecisionGraphEvidenceAssistantIndexV2(): DecisionGraphEvidenceIndexRecordV2[] {
  const wegovyInventory = applyReviewedWegovyMashKnowledgeV2({
    knowledge: evidenceIndexKnowledgeV2,
    marketProducts: evidenceIndexWegovyProductsV2,
    doseRules: [],
    insurancePolicies: [],
  });
  const dpnInventory = applyReviewedPainfulDpnKnowledgeV2({
    knowledge: evidenceIndexKnowledgeV2,
    marketProducts: [],
    doseRules: [],
    insurancePolicies: [],
  });
  const doseRules = [
    ...buildReviewedProductDoseRulesV2({ knowledge: evidenceIndexKnowledgeV2 }),
    ...buildReviewedCardiometabolicDoseRulesV2({ knowledge: evidenceIndexKnowledgeV2 }),
    ...buildReviewedMashDoseRulesV2({ knowledge: evidenceIndexKnowledgeV2 }),
    ...buildReviewedWegovyMashDoseRulesV2(wegovyInventory),
    ...buildReviewedPainfulDpnDoseRulesV2(dpnInventory),
  ];
  const safetyRules = [
    ...buildCoreAda2026DecisionRulesV2(evidenceIndexKnowledgeV2).medicationGateRules,
    ...buildReviewedCardiometabolicGateRulesV2(evidenceIndexKnowledgeV2),
    ...buildReviewedPainfulDpnGateRulesV2(dpnInventory.knowledge),
  ];
  return [
    ...doseRules.map(doseRecord),
    ...safetyRules.map(safetyRecord),
    wegovyMashSafetyEvidenceRecordV2,
  ];
}
