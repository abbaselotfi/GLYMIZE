import { describe, expect, it } from "vitest";
import {
  buildInvestigationRecommendations,
} from "../src/investigation-actions.js";
import {
  bundledClinicalRulePack,
  validateClinicalRulePack,
} from "../src/rule-pack.js";

describe("investigation recommendation safety", () => {
  it("emits no investigation suggestion without an explicit approved rule action", () => {
    expect(
      buildInvestigationRecommendations(
        bundledClinicalRulePack,
        [],
      ),
    ).toEqual([]);
  });

  it("emits a source-bound request only while its required datum is missing", () => {
    const pack = structuredClone(bundledClinicalRulePack);
    pack.rules[0]!.missingDataActions = [
      {
        kind: "request_investigation",
        requiredDataKey: "example.required.data",
        investigationKey: "example.investigation",
        reasonCode: "example_missing_data",
        timing: "before_next_visit",
        priority: "routine",
        blocksDecision: false,
      },
    ];

    const missing =
      buildInvestigationRecommendations(pack, []);

    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      action: "REQUEST_INVESTIGATION",
      requiredDataKey: "example.required.data",
      investigationKey: "example.investigation",
      ruleId: pack.rules[0]!.id,
      rulePackVersion: pack.version,
      sourceIds: pack.rules[0]!.sourceIds,
    });

    expect(
      buildInvestigationRecommendations(
        pack,
        ["example.required.data"],
      ),
    ).toEqual([]);
  });

  it("rejects structurally incomplete missing-data investigation actions", () => {
    const pack = structuredClone(bundledClinicalRulePack);
    pack.rules[0]!.missingDataActions = [
      {
        kind: "request_investigation",
        requiredDataKey: "",
        investigationKey: "",
        reasonCode: "",
        timing: "routine",
        priority: "routine",
        blocksDecision: false,
      },
    ];

    expect(
      validateClinicalRulePack(pack).some(
        (error) =>
          error.includes("missing-data investigation"),
      ),
    ).toBe(true);
  });
});
