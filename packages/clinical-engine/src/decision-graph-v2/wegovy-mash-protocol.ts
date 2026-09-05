import type {
  DecisionGraphInventoryV2,
  DoseRuleV2,
  EvidenceReferenceV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
  PatientContextV2,
  TitrationProtocolV2,
} from "./types.js";

export const wegovy2026LabelEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "US-LABEL-WEGOVY-2026-06",
  title: "WEGOVY (semaglutide) injection/tablets — U.S. prescribing information",
  version: "DailyMed effective 2026-06-18 / SPL version 19",
  url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee06186f-2aa3-4990-a760-757579d8f77b",
  locator: "Indications 1; Dosage and Administration 2.2; Contraindications 4; Warnings 5.1-5.8; Pregnancy 8.1",
  strength: "regulatory_label",
};

export const aasldSemaglutideMash2025EvidenceV2: EvidenceReferenceV2 = {
  sourceId: "aasld-semaglutide-mash-2025",
  title: "AASLD MASLD Practice Guidance — Semaglutide therapy for MASH update",
  version: "2025-11-07",
  url: "https://www.aasld.org/aasld-announces-update-metabolic-dysfunction-associated-steatotic-liver-disease-masld-practice",
  locator: "Patient selection, comorbidity management, monitoring, and F2-F3 MASH context",
  strength: "expert_consensus",
};

export interface WegovyMedicationSafetyContextV2 {
  personalOrFamilyHistoryMtc?: boolean;
  men2?: boolean;
  priorSeriousSemaglutideHypersensitivity?: boolean;
  severeGastroparesis?: boolean;
  suspectedAcutePancreatitis?: boolean;
}

type WegovyPatientContextV2 = PatientContextV2 & {
  medicationSafety?: WegovyMedicationSafetyContextV2;
};

const WEGOVY_STEPS_MG = [0.25, 0.5, 1, 1.7, 2.4] as const;

function normalized(value: string | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isInjectableSemaglutide(medication: KnowledgeMedicationV2) {
  return normalized(medication.genericName).startsWith("semaglutide") &&
    medication.routeOptions.some((route) => normalized(route).includes("subcutaneous"));
}

function isCurrentVerifiedWegovyProduct(product: IranMarketProductV2, masterDrugId?: string) {
  return (!masterDrugId || product.masterDrugId === masterDrugId) &&
    normalized(product.brandName) === "wegovy" &&
    normalized(product.route).includes("subcutaneous") &&
    product.nfiMatchState === "verified" &&
    product.license.currentValid &&
    !product.license.revoked &&
    (product.marketPresence === "confirmed_active" || product.marketPresence === "recently_observed");
}

function semaglutideStrengthMg(product: IranMarketProductV2) {
  const components = product.strengthComponents.filter((item) => normalized(item.unit) === "mg");
  if (components.length !== 1) return undefined;
  const amount = components[0]?.amount;
  return typeof amount === "number" && Number.isFinite(amount) && WEGOVY_STEPS_MG.includes(amount as typeof WEGOVY_STEPS_MG[number])
    ? amount
    : undefined;
}

function uniqueEvidence(values: readonly EvidenceReferenceV2[]) {
  const map = new Map<string, EvidenceReferenceV2>();
  for (const value of values) map.set(value.sourceId, value);
  return [...map.values()];
}

/** Adds the liver effect only when an exact current verified WEGOVY injection
 * presentation is mapped to the semaglutide MasterDrug. Ozempic/generic
 * semaglutide can never inherit this MASH effect from generic identity alone. */
export function applyReviewedWegovyMashKnowledgeV2(inventory: DecisionGraphInventoryV2): DecisionGraphInventoryV2 {
  const knowledge = inventory.knowledge.map((medication) => {
    if (!isInjectableSemaglutide(medication)) return medication;
    const products = inventory.marketProducts.filter((product) => isCurrentVerifiedWegovyProduct(product, medication.masterDrugId));
    if (!products.length) return medication;
    const next = structuredClone(medication);
    next.engineState = "approved";
    next.primaryLanes = [...new Set([...next.primaryLanes, "liver" as const])];
    next.tags = [...new Set([...(next.tags ?? []), "wegovy-mash-f2-f3", "wegovy-product-bound"] )];
    next.evidence = uniqueEvidence([...next.evidence, wegovy2026LabelEvidenceV2, aasldSemaglutideMash2025EvidenceV2]);
    if (!next.effects.some((effect) => effect.objective === "liver_directed_therapy" && effect.phenotype?.includes("WEGOVY"))) {
      next.effects.push({
        objective: "liver_directed_therapy",
        direction: "benefit",
        phenotype: "WEGOVY injection in adults with noncirrhotic MASH and F2-F3 fibrosis",
        evidence: [wegovy2026LabelEvidenceV2, aasldSemaglutideMash2025EvidenceV2],
        note: "Product-bound: generic semaglutide or Ozempic does not inherit the WEGOVY MASH indication.",
      });
    }
    return next;
  });
  return { ...inventory, knowledge };
}

function weeklyRule(medication: KnowledgeMedicationV2, product: IranMarketProductV2, amountMg: number, useCase: DoseRuleV2["useCase"]): DoseRuleV2 {
  const phase = amountMg === 0.25 ? "INIT" : amountMg === 2.4 ? "MAINT" : amountMg === 1.7 ? "MAINT-ALT" : "ESCALATION";
  return {
    id: `LABEL-WEGOVY-MASH-${phase}-${String(amountMg).replace(".", "_")}:${product.productId}`,
    masterDrugId: medication.masterDrugId,
    productId: product.productId,
    indication: "Adults with noncirrhotic MASH and F2-F3 fibrosis — WEGOVY injection only",
    lane: "liver",
    dosageFormGroup: product.dosageFormGroup,
    selectionRole: "product_specific",
    useCase,
    formula: {
      kind: "fixed_interval_components",
      componentsPerAdministration: [{ ingredientKey: medication.masterDrugId, amount: amountMg, unit: "mg" }],
      administrationsPerPeriod: 1,
      periodDays: 7,
    },
    eligibility: {
      all: [
        { fact: "liver.masldMash", op: "eq", value: true },
        { any: [
          { fact: "liver.fibrosisStage", op: "eq", value: "F2" },
          { fact: "liver.fibrosisStage", op: "eq", value: "F3" },
        ] },
        { fact: "liver.cirrhosis", op: "eq", value: false },
      ],
    },
    titration: amountMg === 0.25 ? {
      stepText: "Increase every 4 weeks: 0.25 mg -> 0.5 mg -> 1 mg -> 1.7 mg -> 2.4 mg once weekly; escalation is used to reduce gastrointestinal adverse reactions.",
      intervalDays: 28,
      targetMetric: "tolerability and MASH maintenance dose",
    } : undefined,
    titrationProtocolId: `TITRATE-WEGOVY-MASH:${medication.masterDrugId}`,
    targetDoseText: amountMg === 2.4
      ? "Recommended MASH maintenance: 2.4 mg subcutaneously once weekly."
      : amountMg === 1.7
        ? "If 2.4 mg maintenance is not tolerated, decrease to 1.7 mg once weekly and consider re-escalation to 2.4 mg."
        : "Dose-escalation stage; not a final MASH maintenance dose.",
    maximumDoseText: "MASH maintenance is 2.4 mg once weekly; do not import the higher weight-management dose into the MASH lane.",
    monitoring: [
      "gastrointestinal tolerability and hydration during escalation",
      "signs or symptoms of acute pancreatitis",
      "gallbladder disease",
      "renal function if adverse reactions could cause volume depletion",
      "diabetic retinopathy complications in patients with type 2 diabetes",
    ],
    evidence: [wegovy2026LabelEvidenceV2, aasldSemaglutideMash2025EvidenceV2],
    reviewState: "approved",
  };
}

/** Creates exact product-bound rules only for current verified WEGOVY injection
 * strengths. A non-WEGOVY semaglutide presentation can never execute a MASH rule. */
export function buildReviewedWegovyMashDoseRulesV2(inventory: Pick<DecisionGraphInventoryV2, "knowledge" | "marketProducts">): DoseRuleV2[] {
  const medication = inventory.knowledge.find((item) => item.engineState === "approved" && isInjectableSemaglutide(item) && item.primaryLanes.includes("liver"));
  if (!medication) return [];
  return inventory.marketProducts.flatMap((product): DoseRuleV2[] => {
    if (!isCurrentVerifiedWegovyProduct(product, medication.masterDrugId)) return [];
    const amount = semaglutideStrengthMg(product);
    if (amount === undefined) return [];
    const useCase: DoseRuleV2["useCase"] = amount === 0.25 ? "initiation" : "continuation";
    return [weeklyRule(medication, product, amount, useCase)];
  });
}

export function buildReviewedWegovyMashTitrationProtocolsV2(inventory: Pick<DecisionGraphInventoryV2, "knowledge">): TitrationProtocolV2[] {
  const medication = inventory.knowledge.find((item) => item.engineState === "approved" && isInjectableSemaglutide(item) && item.primaryLanes.includes("liver"));
  if (!medication) return [];
  return [{
    id: `TITRATE-WEGOVY-MASH:${medication.masterDrugId}`,
    masterDrugId: medication.masterDrugId,
    kind: "stepwise_fixed",
    minimumDaysOnCurrentDose: 28,
    steps: [
      [0.25, 0.5],
      [0.5, 1],
      [1, 1.7],
      [1.7, 2.4],
    ].map(([current, next]) => ({
      currentDose: [{ ingredientKey: medication.masterDrugId, amount: current!, unit: "mg" }],
      nextDose: [{ ingredientKey: medication.masterDrugId, amount: next!, unit: "mg" }],
      reason: "WEGOVY injection MASH label: advance after 4 weeks on the current escalation dose when tolerated.",
    })),
    evidence: [wegovy2026LabelEvidenceV2, aasldSemaglutideMash2025EvidenceV2],
    reviewState: "approved",
  }];
}

export type ReviewedWegovyMashStatusV2 = "pass" | "needs_data" | "conditional" | "exclude";
export interface ReviewedWegovyMashOutcomeV2 {
  status: ReviewedWegovyMashStatusV2;
  reasons: string[];
  evidence: EvidenceReferenceV2[];
  doseRuleId?: string;
  requiredProductId?: string;
}

function activeCurrentMedications(patient: WegovyPatientContextV2) {
  return (patient.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active");
}

function isGlp1Group(value: string | undefined) {
  return ["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "fixed_ratio_combination"].includes(value ?? "");
}

/** Initiation gate for product-bound WEGOVY MASH execution. Existing GLP-1 or
 * semaglutide treatment is never silently converted to WEGOVY; it requires a
 * separate medication-reconciliation/continuation decision. */
export function evaluateReviewedWegovyMashProtocolV2(input: {
  patient: WegovyPatientContextV2;
  medication: KnowledgeMedicationV2;
  marketProducts: readonly IranMarketProductV2[];
}): ReviewedWegovyMashOutcomeV2 | undefined {
  const { patient, medication, marketProducts } = input;
  if (!isInjectableSemaglutide(medication) || !medication.primaryLanes.includes("liver")) return undefined;
  const evidence = [wegovy2026LabelEvidenceV2, aasldSemaglutideMash2025EvidenceV2];
  const products = marketProducts.filter((product) => isCurrentVerifiedWegovyProduct(product, medication.masterDrugId));
  if (!products.length) return { status: "exclude", reasons: ["No current verified Iran-market WEGOVY injection presentation is mapped to this semaglutide MasterDrug."], evidence };

  if (patient.ageYears === undefined || !Number.isFinite(patient.ageYears)) return { status: "needs_data", reasons: ["Adult age must be documented for WEGOVY MASH execution."], evidence };
  if (patient.ageYears < 18) return { status: "exclude", reasons: ["The WEGOVY MASH indication is for adults."], evidence };
  if (patient.liver?.masldMash !== true) return { status: "exclude", reasons: ["Documented MASH is required."], evidence };
  const fibrosis = patient.liver?.fibrosisStage;
  if (!fibrosis || fibrosis === "unknown") return { status: "needs_data", reasons: ["Fibrosis stage is required; WEGOVY MASH execution is limited to F2-F3."], evidence };
  if (fibrosis !== "F2" && fibrosis !== "F3") return { status: "exclude", reasons: [`Fibrosis stage ${fibrosis} is outside the reviewed WEGOVY MASH indication.`], evidence };
  if (patient.liver?.cirrhosis === undefined) return { status: "needs_data", reasons: ["Explicit noncirrhotic status is required."], evidence };
  if (patient.liver.cirrhosis || patient.liver.decompensatedCirrhosis) return { status: "exclude", reasons: ["The reviewed WEGOVY MASH pathway is noncirrhotic F2-F3."], evidence };

  const safety = patient.medicationSafety;
  if (!safety || [
    safety.personalOrFamilyHistoryMtc,
    safety.men2,
    safety.priorSeriousSemaglutideHypersensitivity,
    safety.severeGastroparesis,
    safety.suspectedAcutePancreatitis,
  ].some((value) => value === undefined)) {
    return { status: "needs_data", reasons: ["WEGOVY contraindication/warning screening is incomplete (MTC family/personal history, MEN2, serious semaglutide hypersensitivity, severe gastroparesis, and suspected acute pancreatitis)."], evidence };
  }
  if (safety.personalOrFamilyHistoryMtc || safety.men2) return { status: "exclude", reasons: ["WEGOVY is contraindicated with personal/family MTC history or MEN2."], evidence };
  if (safety.priorSeriousSemaglutideHypersensitivity) return { status: "exclude", reasons: ["Prior serious hypersensitivity to semaglutide/WEGOVY is a contraindication."], evidence };
  if (safety.severeGastroparesis) return { status: "exclude", reasons: ["WEGOVY is not recommended in severe gastroparesis; autonomous MASH execution is blocked."], evidence };
  if (safety.suspectedAcutePancreatitis) return { status: "exclude", reasons: ["Suspected acute pancreatitis requires WEGOVY discontinuation/clinical management rather than execution."], evidence };
  if (patient.pregnancy) return { status: "conditional", reasons: ["For MASH during pregnancy, WEGOVY requires explicit clinician benefit-risk assessment; autonomous execution is not allowed."], evidence };

  const active = activeCurrentMedications(patient);
  const activeSemaglutideOrGlp1 = active.filter((item) => normalized(item.genericName).includes("semaglutide") || isGlp1Group(item.therapyGroup));
  if (activeSemaglutideOrGlp1.length) {
    return {
      status: "conditional",
      reasons: ["An active semaglutide-containing or GLP-1-based therapy is documented. The WEGOVY label does not recommend concomitant use; exact product/continuation reconciliation is required before MASH execution."],
      evidence,
    };
  }

  const requiredSteps = new Map<number, IranMarketProductV2>();
  for (const product of products) {
    const amount = semaglutideStrengthMg(product);
    if (amount !== undefined && !requiredSteps.has(amount)) requiredSteps.set(amount, product);
  }
  const missing = WEGOVY_STEPS_MG.filter((step) => !requiredSteps.has(step));
  if (missing.length) {
    return {
      status: "conditional",
      reasons: [`Current verified Iran-market WEGOVY presentations do not cover the complete label escalation path; missing ${missing.join(", ")} mg.`],
      evidence,
    };
  }
  const startProduct = requiredSteps.get(0.25)!;
  return {
    status: "pass",
    reasons: ["Exact current verified WEGOVY injection presentations cover the complete 0.25 -> 0.5 -> 1 -> 1.7 -> 2.4 mg escalation path."],
    evidence,
    doseRuleId: `LABEL-WEGOVY-MASH-INIT-0_25:${startProduct.productId}`,
    requiredProductId: startProduct.productId,
  };
}
