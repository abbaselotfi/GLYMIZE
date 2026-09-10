import { describe, expect, it } from "vitest";
import {
  CLINICAL_MODULE_REGISTRY,
  LEGACY_MODULE_MATURITY_MAP,
  clinicalModuleRegistration,
} from "../lib/clinical-module-registry";

describe("R28-07 clinical module registry", () => {
  it("maps the pre-F1 launcher labels into the canonical Roadmap lifecycle", () => {
    expect(LEGACY_MODULE_MATURITY_MAP).toEqual({
      reviewed_cds: "reviewed_decision_support",
      reviewed_tool: "reviewed_decision_support",
      reference_only: "read_only_context",
    });
  });

  it("registers Type 2 without moving Decision Graph v2 treatment authority into Patient Core", () => {
    const type2 = clinicalModuleRegistration("diabetes-type-2");

    expect(type2).toMatchObject({
      kind: "clinical_module",
      route: "/type-2",
      maturity: "reviewed_decision_support",
      treatmentAuthority: "type2_decision_graph_v2",
      releaseEligibility: "not_assessed",
      patientContextAdapter: "type2_patient_core_v1",
      requiredPatientInputs: ["current_hba1c"],
    });
  });

  it("demonstrates a second read-only domain without claiming treatment support or release eligibility", () => {
    const type1 = clinicalModuleRegistration("type-1");

    expect(type1).toMatchObject({
      kind: "clinical_module",
      route: "/type-1",
      maturity: "read_only_context",
      treatmentAuthority: "none",
      releaseEligibility: "not_assessed",
      patientContextAdapter: "none",
      requiredPatientInputs: [],
    });
  });

  it("keeps registration, treatment authority and release eligibility independent", () => {
    expect(CLINICAL_MODULE_REGISTRY).toHaveLength(4);
    expect(
      CLINICAL_MODULE_REGISTRY.every(
        (module) => module.releaseEligibility === "not_assessed",
      ),
    ).toBe(true);
    expect(
      CLINICAL_MODULE_REGISTRY.filter(
        (module) => module.treatmentAuthority !== "none",
      ).map((module) => module.id),
    ).toEqual(["diabetes-type-2"]);
  });
});
