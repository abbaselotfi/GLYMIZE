import { describe, expect, it } from "vitest";
import { medicationClinicalDomains } from "@glymize/contracts";
import {
  clinicalDomainCapabilities,
  clinicalDomainCapability,
} from "../src/clinical-domain-capabilities.js";

describe("clinical engine multidomain capability boundary", () => {
  it("classifies every current MedicationClinicalDomain exactly once", () => {
    const domains = clinicalDomainCapabilities.map((item) => item.domain);
    expect(new Set(domains).size).toBe(domains.length);
    expect([...domains].sort()).toEqual([...medicationClinicalDomains].sort());
  });

  it("keeps review/specialist/safety domains out of claimed executable coverage", () => {
    for (const domain of [
      "neuropathy",
      "retinopathy",
      "diabetic_foot",
      "nutrition_support",
      "pregnancy",
    ] as const) {
      expect(clinicalDomainCapability(domain).executionState).not.toBe("executable");
    }
  });

  it("records the Phase 4 executable cardiometabolic domains explicitly", () => {
    for (const domain of ["kidney", "hypertension", "lipids", "heart_failure", "ascvd"] as const) {
      const capability = clinicalDomainCapability(domain);
      expect(capability.executionState).toBe("executable");
      expect(capability.decisionGraphLanes.length).toBeGreaterThan(0);
      expect(capability.executableObjectives.length).toBeGreaterThan(0);
      expect(capability.evidenceAuthorities.length).toBeGreaterThan(0);
    }
  });

  it("marks MASH partially executable after resmetirom while preserving the semaglutide gap", () => {
    for (const domain of ["liver", "masld_mash"] as const) {
      const capability = clinicalDomainCapability(domain);
      expect(capability.executionState).toBe("partially_executable");
      expect(capability.decisionGraphLanes).toContain("liver");
      expect(capability.executableObjectives).toContain("liver_directed_therapy");
      expect(capability.nextGap).toContain("semaglutide");
    }
    expect(clinicalDomainCapability("retinopathy").executionState).toBe("specialist_or_escalation");
    expect(clinicalDomainCapability("diabetic_foot").executionState).toBe("specialist_or_escalation");
  });
});
