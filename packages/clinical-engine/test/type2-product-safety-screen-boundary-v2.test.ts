import { describe, expect, it } from "vitest";
import { type2SpecialistInputCatalogV2 } from "../src/type2-input-contract-v2/catalog-specialist.js";
import {
  type2StructuredIntakeToDecisionGraphV2,
  type Type2StructuredConsiderationRequestV2,
} from "../src/type2-intake-v2.js";
import type { ProductSpecificSafetyScreenV2 } from "../src/decision-graph-v2/product-safety-screen.js";

const inventory = {
  knowledge: [],
  marketProducts: [],
  doseRules: [],
  insurancePolicies: [],
};

function request(
  patch: Partial<Type2StructuredConsiderationRequestV2> = {},
): Type2StructuredConsiderationRequestV2 {
  return {
    currentHba1c: 7.4,
    targetHba1c: 7,
    factors: [],
    routePreference: "oral_and_injectable",
    costPreference: "moderate",
    ...patch,
  };
}

describe("Type 2 product-specific safety screen boundary", () => {
  it("carries exact product-bound responses into the specialist graph request without normalizing unknown", () => {
    const screen: ProductSpecificSafetyScreenV2 = {
      masterDrugId: "master-drug-1",
      reviewSetId: "review-set-example",
      reviewSetVersion: "v1",
      responses: [
        { criterionId: "criterion-a", state: "absent" },
        { criterionId: "criterion-b", state: "present" },
        { criterionId: "criterion-c", state: "unknown" },
      ],
    };

    const mapped = type2StructuredIntakeToDecisionGraphV2(request({
      clinicalContext: { productSafetyScreens: [screen] },
    }), inventory);

    expect(mapped.patient.productSafetyScreens).toEqual([screen]);
    expect(mapped.patient.productSafetyScreens?.[0]?.responses[2]?.state).toBe("unknown");
  });

  it("keeps the safety screen absent when no explicit response envelope was supplied", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request(), inventory);
    expect(mapped.patient.productSafetyScreens).toBeUndefined();
  });

  it("publishes request transport separately from clinical completeness or execution", () => {
    const definition = type2SpecialistInputCatalogV2["safety.product_specific_screen"];
    expect(definition.requestSupport).toBe("request_composite");
    expect(definition.requestPath).toBe("clinicalContext.productSafetyScreens");
    expect(definition.description.toLocaleLowerCase()).toContain("does not establish");
    expect(definition.description.toLocaleLowerCase()).toContain("reviewed");
    expect(definition.description.toLocaleLowerCase()).toContain("criterion registry");
  });
});
