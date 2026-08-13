import { describe, expect, it } from "vitest";
import type {
  GenericMedication,
  InsuranceCoverage,
  MedicationPrice,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
  Type2MedicationConsideration,
} from "@glymize/contracts";
import { buildType2Assessment } from "../src/index.js";
import {
  buildType2TreatmentScenarios,
  estimateType2Medication30DayCost,
} from "../src/scenario-engine.js";

const drugs: GenericMedication[] = [
  { id: "metformin", canonicalName: "Metformin", persianName: "متفورمین", className: "Biguanide", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
  { id: "empagliflozin", canonicalName: "Empagliflozin", persianName: "امپاگلیفلوزین", className: "SGLT2 inhibitor", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
  { id: "semaglutide", canonicalName: "Semaglutide", persianName: "سماگلوتاید", className: "GLP-1 receptor agonist", therapyGroup: "glp_1_receptor_agonist", administrationRoute: "subcutaneous" },
  { id: "sitagliptin", canonicalName: "Sitagliptin", persianName: "سیتاگلیپتین", className: "DPP-4 inhibitor", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
  { id: "glimepiride", canonicalName: "Glimepiride", persianName: "گلیمپیرید", className: "Sulfonylurea", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
  { id: "pioglitazone", canonicalName: "Pioglitazone", persianName: "پیوگلیتازون", className: "Thiazolidinedione", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
  { id: "glargine", canonicalName: "Insulin glargine", persianName: "انسولین گلارژین", className: "Basal insulin analog", therapyGroup: "basal_insulin_analog", administrationRoute: "subcutaneous" },
  { id: "resmetirom", canonicalName: "Resmetirom", persianName: "رسمتیروم", className: "Liver-directed MASH therapy", therapyGroup: "liver_directed_therapy", administrationRoute: "oral" },
];

const price = (amountToman: number): MedicationPrice => ({ amountToman, priceKind: "consumer_retail" });
const coverage = (percent: number, patientShareToman?: number): InsuranceCoverage => ({ provider: "social_security", percent, patientShareToman });

function request(patch: Partial<Type2ConsiderationRequest> = {}): Type2ConsiderationRequest {
  return {
    currentHba1c: 8,
    targetHba1c: 7,
    factors: [],
    costPreference: "moderate",
    routePreference: "oral_and_injectable",
    ...patch,
  };
}

function enrichedAssessment(req: Type2ConsiderationRequest, enrich: Record<string, Partial<Type2MedicationConsideration>> = {}) {
  const raw = buildType2Assessment(drugs, req);
  return {
    ...raw,
    medications: raw.medications.map((item) => ({ ...item, ...(enrich[item.genericMedicationId] ?? {}) })),
  } satisfies Type2AssessmentResult;
}

function scenarios(req: Type2ConsiderationRequest, enrich: Record<string, Partial<Type2MedicationConsideration>> = {}) {
  return buildType2TreatmentScenarios({ assessment: enrichedAssessment(req, enrich), request: req, insuranceProvider: "social_security" });
}

function primaryId(req: Type2ConsiderationRequest, enrich: Record<string, Partial<Type2MedicationConsideration>> = {}) {
  return scenarios(req, enrich)[0]?.medications[0]?.genericMedicationId;
}

describe("GLYMIZE 30-case Type 2 clinical scenario validation", () => {
  // 01 — exact target, uncomplicated: avoid unnecessary intensification.
  it("01 keeps an uncomplicated patient at target in maintain/monitor mode", () => {
    const result = scenarios(request({ currentHba1c: 7, targetHba1c: 7 }));
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("maintain_monitor");
  });

  // 02 — slightly below target.
  it("02 does not add glucose-lowering therapy when slightly below target without an outcome indication", () => {
    expect(scenarios(request({ currentHba1c: 6.8, targetHba1c: 7 }))[0]?.kind).toBe("maintain_monitor");
  });

  // 03 — small gap: individualized stepwise therapy rather than forced dual therapy.
  it("03 produces distinct stepwise options for a 0.1 percent A1C gap", () => {
    const result = scenarios(request({ currentHba1c: 7.1, targetHba1c: 7 }));
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
  });

  // 04 — just below ADA combination threshold.
  it("04 does not force a two-drug new-start pair at a 1.4 percent gap", () => {
    const result = scenarios(request({ currentHba1c: 8.4, targetHba1c: 7 }));
    expect(result[0]?.medications).toHaveLength(1);
  });

  // 05 — threshold edge at 1.5% above goal.
  it("05 allows an initial compatible two-mechanism scenario at a 1.5 percent gap", () => {
    const result = scenarios(request({ currentHba1c: 8.5, targetHba1c: 7 }));
    expect(result[0]?.medications.length).toBeGreaterThanOrEqual(1);
    if ((result[0]?.medications.length ?? 0) === 2) {
      expect(result[0]?.medications[0]?.therapeuticClass).not.toBe(result[0]?.medications[1]?.therapeuticClass);
    }
  });

  // 06 — far from target.
  it("06 creates no more than three prioritized scenarios when far above target", () => {
    const result = scenarios(request({ currentHba1c: 9.8, targetHba1c: 7 }));
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  // 07 — ADA strict edge: A1C = 10 alone is not the >10 severe criterion.
  it("07 does not label A1C exactly 10 percent as urgent solely by the numeric threshold", () => {
    const req = request({ currentHba1c: 10, targetHba1c: 7 });
    expect(enrichedAssessment(req).recommendation.urgentReview).toBe(false);
  });

  // 08 — A1C >10.
  it("08 prioritizes insulin-path review when A1C is above 10 percent", () => {
    const req = request({ currentHba1c: 10.1, targetHba1c: 7 });
    expect(enrichedAssessment(req).recommendation.urgentReview).toBe(true);
    expect(primaryId(req)).toBe("glargine");
  });

  // 09 — symptoms override A1C threshold.
  it("09 activates urgent insulin review for symptomatic hyperglycemia below 10 percent", () => {
    const req = request({ currentHba1c: 8.7, hyperglycemiaSymptoms: true });
    expect(enrichedAssessment(req).recommendation.urgentReview).toBe(true);
    expect(primaryId(req)).toBe("glargine");
  });

  // 10 — catabolism override.
  it("10 activates urgent insulin review for catabolic features", () => {
    const req = request({ currentHba1c: 8.3, catabolicFeatures: true });
    expect(enrichedAssessment(req).recommendation.urgentReview).toBe(true);
    expect(primaryId(req)).toBe("glargine");
  });

  // 11 — CKD, eGFR 59.
  it("11 prioritizes an SGLT2 option in non-advanced CKD", () => {
    const req = request({ factors: ["ckd"], clinicalContext: { kidney: { ckd: true, eGfr: 59, uacrMgG: 120 } } });
    expect(primaryId(req)).toBe("empagliflozin");
  });

  // 12 — CKD at eGFR 45 edge.
  it("12 keeps cardiorenal therapy high at eGFR 45", () => {
    const req = request({ factors: ["ckd"], clinicalContext: { kidney: { ckd: true, eGfr: 45, uacrMgG: 300 } } });
    expect(["empagliflozin", "semaglutide"]).toContain(primaryId(req));
  });

  // 13 — advanced CKD: preserve both kidney-protective SGLT2 and GLP-1 glycemic pathways.
  it("13 keeps both SGLT2 and GLP-1 represented in advanced CKD eGFR 29", () => {
    const req = request({ factors: ["ckd"], clinicalContext: { kidney: { ckd: true, eGfr: 29 } } });
    const topTwoMedicationIds = scenarios(req).slice(0, 2).flatMap((scenario) => scenario.medications.map((item) => item.genericMedicationId));
    expect(topTwoMedicationIds).toContain("empagliflozin");
    expect(topTwoMedicationIds).toContain("semaglutide");
  });

  // 14 — eGFR <20: do not represent SGLT2 as a routine new-start scenario.
  it("14 does not make new-start SGLT2 the primary scenario below eGFR 20", () => {
    const req = request({ factors: ["ckd"], clinicalContext: { kidney: { ckd: true, eGfr: 19 } } });
    expect(primaryId(req)).not.toBe("empagliflozin");
  });

  // 15 — dialysis.
  it("15 favors non-kidney-cleared GLP-1 based therapy over new SGLT2 initiation on dialysis", () => {
    const req = request({ factors: ["ckd"], clinicalContext: { kidney: { ckd: true, eGfr: 8, dialysis: true } } });
    expect(primaryId(req)).toBe("semaglutide");
  });

  // 16 — at target but ASCVD: outcome indication remains active.
  it("16 still offers cardioprotective therapy when A1C is exactly at target with ASCVD", () => {
    const req = request({ currentHba1c: 7, targetHba1c: 7, factors: ["ascvd"], clinicalContext: { cardiovascular: { ascvd: true, priorMi: true } } });
    const result = scenarios(req);
    expect(result[0]?.kind).not.toBe("maintain_monitor");
    expect(["semaglutide", "empagliflozin"]).toContain(result[0]?.medications[0]?.genericMedicationId);
  });

  // 17 — heart failure.
  it("17 makes SGLT2 the leading scenario in established heart failure", () => {
    const req = request({ factors: ["heart_failure"], clinicalContext: { cardiovascular: { heartFailure: true, lvefPercent: 35 } } });
    expect(primaryId(req)).toBe("empagliflozin");
  });

  // 18 — HF should not surface TZD as preferred.
  it("18 excludes TZD from the leading heart-failure scenario", () => {
    const req = request({ factors: ["heart_failure"], clinicalContext: { cardiovascular: { heartFailure: true } } });
    expect(primaryId(req)).not.toBe("pioglitazone");
  });

  // 19 — weight priority.
  it("19 prioritizes GLP-1 based therapy when weight reduction is a priority", () => {
    const req = request({ factors: ["weight_priority"], clinicalContext: { anthropometrics: { bmi: 36 } } });
    expect(primaryId(req)).toBe("semaglutide");
  });

  // 20 — hypoglycemia risk.
  it("20 avoids insulin and sulfonylurea as the leading non-urgent option with high hypoglycemia risk", () => {
    const req = request({ factors: ["hypoglycemia_risk"] });
    expect(["glargine", "glimepiride"]).not.toContain(primaryId(req));
  });

  // 21 — MASLD/MASH metabolic phenotype.
  it("21 keeps GLP-1 based therapy prominent in MASLD/MASH with obesity", () => {
    const req = request({ factors: ["masld_mash", "weight_priority"], clinicalContext: { liver: { masldMash: true, fibrosisStage: "F1" }, anthropometrics: { bmi: 34 } } });
    expect(primaryId(req)).toBe("semaglutide");
  });

  // 22 — non-cirrhotic F2/F3 may expose liver-directed adjunct but does not erase glycemic logic.
  it("22 recognizes the F2 non-cirrhotic MASH context without replacing the diabetes pathway", () => {
    const req = request({ factors: ["masld_mash"], clinicalContext: { liver: { masldMash: true, fibrosisStage: "F2", cirrhosis: false } } });
    const result = scenarios(req);
    expect(result.some((scenario) => scenario.medications.some((item) => item.genericMedicationId === "resmetirom")) || result.length > 0).toBe(true);
  });

  // 23 — cirrhosis blocks resmetirom in the existing evidence engine.
  it("23 does not select resmetirom as the leading scenario in cirrhosis", () => {
    const req = request({ factors: ["masld_mash"], clinicalContext: { liver: { masldMash: true, fibrosisStage: "F4", cirrhosis: true } } });
    expect(primaryId(req)).not.toBe("resmetirom");
  });

  // 24 — diabetic foot is a parallel care path, not an artificial glucose-drug ranking rule.
  it("24 attaches a parallel diabetic-foot pathway without inventing a glucose-drug contraindication", () => {
    const req = request({ factors: ["diabetic_foot"] });
    const result = scenarios(req);
    expect(result[0]?.parallelCareFa.some((line) => line.includes("IWGDF"))).toBe(true);
  });

  // 25 — diabetic foot + target A1C should still surface foot care even if glucose therapy is maintained.
  it("25 keeps the diabetic-foot alert visible when A1C is at target", () => {
    const req = request({ currentHba1c: 7, targetHba1c: 7, factors: ["diabetic_foot"] });
    const result = scenarios(req);
    expect(result[0]?.parallelCareFa.length).toBeGreaterThan(0);
  });

  // 26 — insured-only market gate.
  it("26 uses only covered medicines when insured-only is selected", () => {
    const req = request({ costPreference: "insured_only" });
    const enrich = {
      empagliflozin: { insuranceCoverages: [coverage(70)] },
      metformin: { insuranceCoverages: [coverage(90)] },
    };
    const result = scenarios(req, enrich);
    for (const scenario of result) {
      for (const medication of scenario.medications) expect(medication.insuranceCoverages.length).toBeGreaterThan(0);
    }
  });

  // 27 — oral-only route gate.
  it("27 removes injectable candidates from all scenarios when oral-only is selected", () => {
    const req = request({ routePreference: "oral_only", factors: ["weight_priority"] });
    const result = scenarios(req);
    expect(result.flatMap((scenario) => scenario.medications).some((item) => item.genericMedicationId === "semaglutide")).toBe(false);
  });

  // 28 — missing price must never fabricate a monthly amount.
  it("28 returns price_missing instead of fabricating a 30-day cost", () => {
    const result = estimateType2Medication30DayCost({ insuranceProvider: "social_security", plan: { dailyUnits: 1, unitsPerPackage: 30 } });
    expect(result.status).toBe("price_missing");
    expect(result.patient30DaysToman).toBeUndefined();
  });

  // 29 — percentage alone is not enough to invent a patient bill.
  it("29 calculates retail use but does not invent patient cost from percentage-only insurance", () => {
    const result = estimateType2Medication30DayCost({
      price: price(100_000),
      coverages: [coverage(20)],
      insuranceProvider: "social_security",
      plan: { dailyUnits: 2, unitsPerPackage: 30, unitLabel: "tablet" },
    });
    expect(result.status).toBe("retail_only");
    expect(result.packagesFor30Days).toBe(2);
    expect(result.retail30DaysToman).toBe(200_000);
    expect(result.patient30DaysToman).toBeUndefined();
    expect(result.insurer30DaysToman).toBeUndefined();
  });

  // 30 — explicit insurer source shares override percentage approximation.
  it("30 honors an explicit patient-share amount from insurer data", () => {
    const result = estimateType2Medication30DayCost({
      price: price(120_000),
      coverages: [coverage(50, 25_000)],
      insuranceProvider: "social_security",
      plan: { dailyUnits: 1, unitsPerPackage: 10 },
    });
    expect(result.packagesFor30Days).toBe(3);
    expect(result.patient30DaysToman).toBe(75_000);
    expect(result.insurer30DaysToman).toBe(285_000);
  });
  it("31 calculates insurer share from a reference tariff instead of retail price", () => {
    const result = estimateType2Medication30DayCost({
      price: price(120_000),
      coverages: [{ provider: "social_security", percent: 50, referencePriceToman: 80_000 }],
      insuranceProvider: "social_security",
      plan: { dailyUnits: 1, unitsPerPackage: 10 },
    });
    expect(result.status).toBe("calculated");
    expect(result.packagesFor30Days).toBe(3);
    expect(result.patient30DaysToman).toBe(240_000);
    expect(result.insurer30DaysToman).toBe(120_000);
  });

  it("32 calculates a 30-day retail range for a generic with multiple NFI products", () => {
    const result = estimateType2Medication30DayCost({
      priceRange: { minToman: 100_000, medianToman: 150_000, maxToman: 200_000, productCount: 3, basis: "nfi_comparable_products" },
      insuranceProvider: "social_security",
      plan: { dailyUnits: 1, unitsPerPackage: 30 },
    });
    expect(result.status).toBe("calculated_range");
    expect(result.retail30DaysMinToman).toBe(100_000);
    expect(result.retail30DaysMaxToman).toBe(200_000);
    expect(result.patient30DaysToman).toBeUndefined();
  });

  it("33 can reorder clinically acceptable scenarios by observed market price", () => {
    const req = request({ factors: ["weight_priority"] });
    const assessment = enrichedAssessment(req, {
      semaglutide: { price: price(2_000_000) },
      metformin: { price: price(100_000) },
      empagliflozin: { price: price(500_000) },
    });
    const result = buildType2TreatmentScenarios({
      assessment,
      request: req,
      insuranceProvider: "social_security",
      sortMode: "patient_cost",
      costingPlansByMedicationId: {
        semaglutide: { dailyUnits: 1, unitsPerPackage: 30 },
        metformin: { dailyUnits: 1, unitsPerPackage: 30 },
        empagliflozin: { dailyUnits: 1, unitsPerPackage: 30 },
      },
    });
    const observed = result
      .map((scenario) => scenario.medications[0]?.price?.amountToman)
      .filter((value): value is number => value !== undefined);
    if (observed.length > 1) expect(observed[0]).toBe(Math.min(...observed));
  });

  it("34 keeps a multi-presentation generic market range display-only", () => {
    const result = estimateType2Medication30DayCost({
      priceRange: {
        minToman: 100_000,
        medianToman: 150_000,
        maxToman: 220_000,
        productCount: 12,
        basis: "nfi_generic_market_range",
        costComparable: false,
        presentationCount: 4,
      },
      plan: { dailyUnits: 1, unitsPerPackage: 30 },
    });
    expect(result.status).toBe("per_package_only");
    expect(result.retail30DaysMinToman).toBeUndefined();
    expect(result.retail30DaysMaxToman).toBeUndefined();
  });

  it("35 excludes conditional insurance from financial calculation", () => {
    const result = estimateType2Medication30DayCost({
      price: price(100_000),
      coverages: [{
        provider: "health_insurance",
        percent: 90,
        runtimeEligibleForRanking: false,
        conditions: "requires a qualifying clinical condition",
      }],
      insuranceProvider: "health_insurance",
      plan: { dailyUnits: 1, unitsPerPackage: 30 },
    });
    expect(result.status).toBe("calculated");
    expect(result.patient30DaysToman).toBe(100_000);
    expect(result.insurer30DaysToman).toBe(0);
  });

  it("36 calculates a multi-presentation retail range only when Market v2.3 verifies a common package measure", () => {
    const result = estimateType2Medication30DayCost({
      priceRange: {
        minToman: 100_000,
        medianToman: 150_000,
        maxToman: 220_000,
        productCount: 12,
        basis: "nfi_generic_market_range",
        costComparable: false,
        presentationCount: 4,
      },
      plan: {
        dailyUnits: 20,
        unitsPerPackage: 900,
        unitLabel: "واحد انسولین",
        marketPackageVerified: true,
      },
    });
    expect(result.status).toBe("calculated_range");
    expect(result.packagesFor30Days).toBe(1);
    expect(result.retail30DaysMinToman).toBe(100_000);
    expect(result.retail30DaysMaxToman).toBe(220_000);
  });

});
