import {
  currentMedicationAdministrationIntervalV2,
  currentMedicationIntervalIssueV2,
  type IntervalAwareCurrentMedicationV2,
} from "./current-medication-interval.js";
import type {
  CurrentMedicationV2,
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
type WegovyStepMgV2 = (typeof WEGOVY_STEPS_MG)[number];

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
  return typeof amount === "number" && Number.isFinite(amount) && WEGOVY_STEPS_MG.includes(amount as WegovyStepMgV2)
    ? amount as WegovyStepMgV2
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

function doseRuleIdForStep(step: WegovyStepMgV2, productId: string) {
  const phase = step === 0.25 ? "INIT" : step === 2.4 ? "MAINT" : step === 1.7 ? "MAINT-ALT" : "ESCALATION";
  return `LABEL-WEGOVY-MASH-${phase}-${String(step).replace(".", "_")}:${productId}`;
}

function weeklyRule(medication: KnowledgeMedicationV2, product: IranMarketProductV2, amountMg: number, useCase: DoseRuleV2["useCase"]): DoseRuleV2 {
  const step = amountMg as WegovyStepMgV2;
  return {
    id: doseRuleIdForStep(step, product.productId),
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
      stepText: "Increase every 4 weeks: 0.25 mg -> 0.5 mg -> 1 mg -> 1.7 mg -> 2.4 mg once weekly; if a dose is not tolerated during escalation, consider delaying escalation for 4 weeks.",
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
    // 0.25 mg is initiation but can also be held for another four weeks when
    // escalation is delayed for tolerability, so it must remain continuation-capable.
    const useCase: DoseRuleV2["useCase"] = amount === 0.25 ? "either" : "continuation";
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
      reason: "WEGOVY injection MASH label: advance after 4 weeks on the current escalation dose when tolerated; delay escalation for 4 weeks when the current dose is not tolerated.",
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

function currentWegovyMedication(item: CurrentMedicationV2, medication: KnowledgeMedicationV2) {
  const extended = item as IntervalAwareCurrentMedicationV2;
  return normalized(item.genericName).includes("semaglutide") &&
    normalized(extended.brandName) === "wegovy" &&
    (!item.masterDrugId || item.masterDrugId === medication.masterDrugId);
}

function uniqueProductForStep(
  products: readonly IranMarketProductV2[],
  step: WegovyStepMgV2,
  referencePresentationId?: string,
) {
  const candidates = products.filter((product) => semaglutideStrengthMg(product) === step);
  if (referencePresentationId) {
    const referenced = candidates.filter((product) => product.productId === referencePresentationId);
    return referenced.length === 1 ? referenced[0] : undefined;
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

function continuationOutcome(input: {
  current: CurrentMedicationV2;
  medication: KnowledgeMedicationV2;
  products: readonly IranMarketProductV2[];
  evidence: EvidenceReferenceV2[];
}): ReviewedWegovyMashOutcomeV2 {
  const { current, medication, products, evidence } = input;
  const issue = currentMedicationIntervalIssueV2(current);
  if (issue) return { status: "needs_data", reasons: [`Current WEGOVY interval is invalid: ${issue}`], evidence };
  const interval = currentMedicationAdministrationIntervalV2(current);
  if (!interval || interval.source !== "explicit_interval") {
    return { status: "needs_data", reasons: ["Exact WEGOVY continuation requires an explicit administration interval; legacy frequency-per-day data cannot represent once-weekly treatment."], evidence };
  }
  if (interval.administrationsPerPeriod !== 1 || interval.periodDays !== 7 || interval.perAdministrationDose.length !== 1) {
    return { status: "needs_data", reasons: ["Documented WEGOVY continuation schedule must resolve to exactly one administration every 7 days."], evidence };
  }
  const currentDose = interval.perAdministrationDose[0];
  if (!currentDose || normalized(currentDose.unit) !== "mg" || (currentDose.ingredientKey !== medication.masterDrugId && current.masterDrugId === medication.masterDrugId)) {
    return { status: "needs_data", reasons: ["Current WEGOVY per-administration dose is not mapped to the semaglutide MasterDrug in mg."], evidence };
  }
  const step = WEGOVY_STEPS_MG.find((value) => Math.abs(value - currentDose.amount) < 1e-9);
  if (step === undefined) return { status: "needs_data", reasons: [`Documented WEGOVY dose ${currentDose.amount} mg is outside the reviewed MASH escalation/maintenance stages.`], evidence };
  const currentProduct = uniqueProductForStep(products, step, interval.referencePresentationId);
  if (!currentProduct) {
    return { status: "needs_data", reasons: [`Current ${step} mg WEGOVY presentation is missing or ambiguous; exact current-market product reconciliation is required.`], evidence };
  }

  if (!current.adherence || current.adherence === "unknown") {
    return { status: "needs_data", reasons: ["Current WEGOVY adherence must be documented before autonomous continuation/escalation."], evidence };
  }
  if (current.adherence === "partial" || current.adherence === "poor") {
    return { status: "conditional", reasons: ["Current WEGOVY adherence is not good; dose-stage timing cannot be advanced autonomously."], evidence };
  }
  if (!current.tolerance || current.tolerance === "unknown") {
    return { status: "needs_data", reasons: ["Current WEGOVY tolerability must be documented before autonomous continuation/escalation."], evidence };
  }
  if (current.tolerance === "intolerant") {
    return { status: "conditional", reasons: ["Current WEGOVY is documented as intolerant; clinician review is required before holding, reducing, or discontinuing therapy."], evidence };
  }
  if (interval.daysOnCurrentDose === undefined) {
    return { status: "needs_data", reasons: ["daysOnCurrentDose is required; total medication durationDays is not a substitute for time on the current WEGOVY stage."], evidence };
  }

  const phase = interval.therapyPhase;
  if (step <= 1 && phase === "maintenance") {
    return { status: "needs_data", reasons: [`${step} mg WEGOVY is an initiation/escalation dose, not a MASH maintenance dose.`], evidence };
  }
  if (step === 1.7 && !phase) {
    return { status: "needs_data", reasons: ["1.7 mg WEGOVY requires explicit therapyPhase because it can represent week 13-16 escalation or a maintenance fallback after 2.4 mg intolerance."], evidence };
  }
  if (step === 1.7 && phase === "initiation") {
    return { status: "needs_data", reasons: ["1.7 mg WEGOVY cannot be documented as the initiation phase."], evidence };
  }
  if (step === 2.4 && phase && phase !== "maintenance") {
    return { status: "needs_data", reasons: ["2.4 mg WEGOVY is the recommended MASH maintenance dose; the documented therapyPhase is inconsistent."], evidence };
  }

  let targetStep = step;
  let reason: string;
  if (step === 2.4) {
    if (current.tolerance === "limited") {
      return { status: "conditional", reasons: ["Tolerability at 2.4 mg is limited; the MASH label allows reduction to 1.7 mg when 2.4 mg is not tolerated, so clinician-specific benefit-risk review is required."], evidence };
    }
    reason = "Exact WEGOVY 2.4 mg once-weekly maintenance is documented with good adherence and tolerability.";
  } else if (step === 1.7 && phase === "maintenance") {
    if (current.tolerance === "limited") {
      return { status: "conditional", reasons: ["Tolerability remains limited at the 1.7 mg maintenance fallback; autonomous continuation or re-escalation is not allowed."], evidence };
    }
    reason = "Exact WEGOVY 1.7 mg maintenance fallback is documented and tolerated; re-escalation to 2.4 mg remains a clinician consideration rather than an automatic step.";
  } else if (interval.daysOnCurrentDose < 28) {
    reason = `Current WEGOVY ${step} mg escalation stage has ${interval.daysOnCurrentDose} documented day(s); continue the same once-weekly stage until at least 28 days before considering escalation.`;
  } else if (current.tolerance === "limited") {
    reason = `Tolerability is limited at WEGOVY ${step} mg; hold the same once-weekly stage and delay escalation rather than increasing automatically.`;
  } else {
    const index = WEGOVY_STEPS_MG.indexOf(step);
    const next = WEGOVY_STEPS_MG[index + 1];
    if (next === undefined) {
      reason = `Continue WEGOVY ${step} mg once weekly.`;
    } else {
      targetStep = next;
      reason = `WEGOVY ${step} mg has been taken for at least 28 days with good adherence and tolerability in an escalation phase; advance to ${next} mg once weekly.`;
    }
  }

  const targetProduct = targetStep === step
    ? currentProduct
    : uniqueProductForStep(products, targetStep);
  if (!targetProduct) {
    return { status: "conditional", reasons: [`Target WEGOVY ${targetStep} mg current-market presentation is missing or ambiguous; autonomous product selection is not allowed.`], evidence };
  }
  return {
    status: "pass",
    reasons: [reason],
    evidence,
    doseRuleId: doseRuleIdForStep(targetStep, targetProduct.productId),
    requiredProductId: targetProduct.productId,
  };
}

/** Product-bound WEGOVY MASH gate for initiation and exact current-treatment
 * continuation. Generic semaglutide/Ozempic and other GLP-1 therapies never
 * inherit this pathway and remain medication-reconciliation decisions. */
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
  const exactWegovy = active.filter((item) => currentWegovyMedication(item, medication));
  const activeSemaglutideOrGlp1 = active.filter((item) => normalized(item.genericName).includes("semaglutide") || isGlp1Group(item.therapyGroup));

  if (exactWegovy.length > 1) {
    return { status: "conditional", reasons: ["Multiple active WEGOVY entries are documented; exact medication reconciliation is required before continuation."], evidence };
  }
  if (exactWegovy.length === 1) {
    const current = exactWegovy[0]!;
    const otherGlp = activeSemaglutideOrGlp1.filter((item) => item !== current);
    if (otherGlp.length) {
      return { status: "conditional", reasons: ["WEGOVY is documented with another active semaglutide/GLP-1-based therapy; concomitant use must be reconciled before execution."], evidence };
    }
    return continuationOutcome({ current, medication, products, evidence });
  }

  if (activeSemaglutideOrGlp1.length) {
    return {
      status: "conditional",
      reasons: ["An active semaglutide-containing or GLP-1-based therapy is documented, but it is not reconciled as exact WEGOVY. Generic semaglutide/Ozempic cannot be converted to the WEGOVY MASH pathway automatically."],
      evidence,
    };
  }

  const requiredSteps = new Map<WegovyStepMgV2, IranMarketProductV2>();
  for (const step of WEGOVY_STEPS_MG) {
    const product = uniqueProductForStep(products, step);
    if (!product) {
      return {
        status: "conditional",
        reasons: [`Current verified Iran-market WEGOVY ${step} mg presentation is missing or ambiguous; the complete escalation path cannot be selected autonomously.`],
        evidence,
      };
    }
    requiredSteps.set(step, product);
  }
  const startProduct = requiredSteps.get(0.25)!;
  return {
    status: "pass",
    reasons: ["Exact current verified WEGOVY injection presentations cover the complete 0.25 -> 0.5 -> 1 -> 1.7 -> 2.4 mg escalation path."],
    evidence,
    doseRuleId: doseRuleIdForStep(0.25, startProduct.productId),
    requiredProductId: startProduct.productId,
  };
}
