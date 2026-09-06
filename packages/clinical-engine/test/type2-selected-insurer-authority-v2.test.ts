import { describe, expect, it } from "vitest";
import {
  resolveType2InsuranceProvidersForDecisionGraphV2,
} from "../src/type2-decision-graph-compat.js";
import {
  resolveType2InsuranceProvidersV2,
  type2StructuredIntakeToDecisionGraphV2,
} from "../src/type2-intake-v2.js";
import type { DecisionGraphInventoryV2 } from "../src/decision-graph-v2/types.js";

const emptyInventory: DecisionGraphInventoryV2 = {
  knowledge: [],
  marketProducts: [],
  doseRules: [],
  insurancePolicies: [],
};

describe("selected insurer authority", () => {
  it("lets an explicit clinician-selected insurer override unrelated coverage providers", () => {
    expect(resolveType2InsuranceProvidersV2({
      currentHba1c: 8,
      targetHba1c: 7,
      factors: [],
      costPreference: "insured_only",
      insuranceProvider: "social_security",
      insuranceCoverageByMedicationId: {
        metformin: [
          { provider: "health_insurance", percent: 90 },
          { provider: "social_security", percent: 70 },
        ],
      },
    })).toEqual(["social_security"]);
  });

  it("preserves legacy provider derivation only when no insurer was explicitly selected", () => {
    expect(resolveType2InsuranceProvidersV2({
      currentHba1c: 8,
      targetHba1c: 7,
      factors: [],
      insuranceCoverageByMedicationId: {
        metformin: [
          { provider: "health_insurance", percent: 90 },
          { provider: "social_security", percent: 70, runtimeEligibleForRanking: false },
        ],
      },
    })).toEqual(["health_insurance"]);
  });

  it("keeps the compatibility bridge on the canonical insurer resolver", () => {
    expect(resolveType2InsuranceProvidersForDecisionGraphV2({
      currentHba1c: 8,
      targetHba1c: 7,
      factors: [],
      insuranceProvider: "social_security",
      insuranceCoverageByMedicationId: {
        metformin: [{ provider: "health_insurance", percent: 90 }],
      },
    })).toEqual(["social_security"]);
  });

  it("projects the selected insurer into structured Decision Graph preferences", () => {
    const graphRequest = type2StructuredIntakeToDecisionGraphV2({
      currentHba1c: 8,
      targetHba1c: 7,
      factors: [],
      costPreference: "insured_only",
      insuranceProvider: "social_security",
    }, emptyInventory);

    expect(graphRequest.preferences.insuranceProviders).toEqual(["social_security"]);
    expect(graphRequest.preferences.costPreference).toBe("insured_only");
  });
});
