import { afterEach, describe, expect, it } from "vitest";
import type { GenericMedication, Type2ConsiderationRequest } from "@glymize/contracts";
import { buildType2Assessment as buildLegacyType2Assessment } from "../src/index.js";
import {
  buildType2Assessment,
  clearType2DecisionGraphRuntimeCatalogForTests,
} from "../src/index-runtime.js";
import {
  activateApprovedClinicalRulePack,
  bundledClinicalRulePack,
  resetClinicalRulePackForTests,
} from "../src/rule-pack.js";

function medication(overrides: Partial<GenericMedication> & Pick<GenericMedication, "id" | "canonicalName">): GenericMedication {
  return {
    persianName: overrides.canonicalName,
    therapyGroup: "oral_glucose_lowering",
    administrationRoute: "oral",
    ...overrides,
  };
}

function request(overrides: Partial<Type2ConsiderationRequest> = {}): Type2ConsiderationRequest {
  return {
    currentHba1c: 8,
    targetHba1c: 7,
    factors: [],
    costPreference: "no_constraint",
    ...overrides,
  };
}

afterEach(() => {
  clearType2DecisionGraphRuntimeCatalogForTests();
  resetClinicalRulePackForTests();
});

describe("Phase 3 Task 4 — structural hard exclusions", () => {
  it("removes metformin from the unconfigured compatibility result below the approved eGFR contraindication threshold", () => {
    const metformin = medication({
      id: "metformin",
      canonicalName: "Metformin",
      className: "Biguanide",
    });
    const sitagliptin = medication({
      id: "sitagliptin",
      canonicalName: "Sitagliptin",
      className: "DPP-4 inhibitor",
    });

    const result = buildType2Assessment([metformin, sitagliptin], request({
      eGfr: 20,
      factors: ["ckd"],
    }));

    expect(result.medications.map((item) => item.genericMedicationId)).toEqual(["sitagliptin"]);
  });

  it("prevents a contraindicated TZD from winning even when adversarial legacy weights would rank it above a safe option", () => {
    const pack = structuredClone(bundledClinicalRulePack);
    pack.version = "2026.08.1-task4-adversarial";
    pack.type2.weights.tzdHeartFailurePenalty = 0;
    pack.type2.weights.lowCostOnlyLow = 40;
    activateApprovedClinicalRulePack(pack);

    const pioglitazone = medication({
      id: "pioglitazone",
      canonicalName: "Pioglitazone",
      className: "Thiazolidinedione",
    });
    const sitagliptin = medication({
      id: "sitagliptin",
      canonicalName: "Sitagliptin",
      className: "DPP-4 inhibitor",
    });
    const clinicalRequest = request({
      factors: ["heart_failure"],
      costPreference: "low_cost_only",
    });

    const retiredScoreBuilder = buildLegacyType2Assessment(
      [pioglitazone, sitagliptin],
      clinicalRequest,
      pack,
    );
    expect(retiredScoreBuilder.medications[0]?.genericMedicationId).toBe("pioglitazone");

    const packageRuntimeResult = buildType2Assessment(
      [pioglitazone, sitagliptin],
      clinicalRequest,
    );
    expect(packageRuntimeResult.medications.map((item) => item.genericMedicationId)).toEqual(["sitagliptin"]);
  });

  it("removes resmetirom when the required non-cirrhotic MASH F2-F3 eligibility is not satisfied", () => {
    const resmetirom = medication({
      id: "resmetirom",
      canonicalName: "Resmetirom",
      className: "THR-beta agonist",
      therapyGroup: "liver_directed_therapy",
    });
    const result = buildType2Assessment([resmetirom], request({
      factors: ["masld_mash"],
      clinicalContext: {
        liver: { masldMash: true, fibrosisStage: "F1", cirrhosis: false },
      },
    }));

    expect(result.medications).toEqual([]);
  });

  it("does not turn a soft hypoglycemia-risk de-prioritization into a structural contraindication", () => {
    const glimepiride = medication({
      id: "glimepiride",
      canonicalName: "Glimepiride",
      className: "Sulfonylurea",
    });
    const result = buildType2Assessment([glimepiride], request({
      factors: ["hypoglycemia_risk"],
    }));

    expect(result.medications.map((item) => item.genericMedicationId)).toEqual(["glimepiride"]);
  });
});
