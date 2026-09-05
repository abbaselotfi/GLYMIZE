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

  it("keeps specialist/review/safety domains out of falsely claimed full executable coverage", () => {
    for (const domain of ["retinopathy", "diabetic_foot", "nutrition_support", "pregnancy"] as const) {
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

  it("marks MASH partially executable for reviewed product-bound initiation while keeping continuation/cost gaps explicit", () => {
    for (const domain of ["liver", "masld_mash"] as const) {
      const capability = clinicalDomainCapability(domain);
      expect(capability.executionState).toBe("partially_executable");
      expect(capability.decisionGraphLanes).toContain("liver");
      expect(capability.executableObjectives).toContain("liver_directed_therapy");
      expect(capability.boundary.toLocaleLowerCase()).toContain("resmetirom");
      expect(capability.boundary).toContain("WEGOVY");
      expect(capability.nextGap?.toLocaleLowerCase()).toMatch(/interval|titration/);
    }
  });

  it("truthfully promotes only the reviewed painful-DPN phenotype to partial execution", () => {
    const capability = clinicalDomainCapability("neuropathy");
    expect(capability.executionState).toBe("partially_executable");
    expect(capability.decisionGraphLanes).toContain("neuropathy");
    expect(capability.executableObjectives).toContain("painful_dpn_symptom_control");
    expect(capability.minimumSafeInputs.join(" ").toLocaleLowerCase()).toContain("physician-confirmed");
    expect(capability.boundary.toLocaleLowerCase()).toMatch(/pregabalin.*duloxetine|duloxetine.*pregabalin/);
    expect(capability.boundary.toLocaleLowerCase()).toContain("opioid");
  });

  it("records completed specialist escalation workflows without claiming autonomous specialist prescribing", () => {
    const retinopathy = clinicalDomainCapability("retinopathy");
    expect(retinopathy.executionState).toBe("specialist_or_escalation");
    expect(retinopathy.boundary).toContain("prompt ophthalmology escalation");
    expect(retinopathy.boundary.toLocaleLowerCase()).toContain("outside medication ranking");

    const foot = clinicalDomainCapability("diabetic_foot");
    expect(foot.executionState).toBe("specialist_or_escalation");
    expect(foot.boundary.toLocaleLowerCase()).toContain("uninfected ulcers cannot execute antibiotics");
    expect(foot.nextGap?.toLocaleLowerCase()).toContain("pathogen");
  });

  it("records nutrition safety closure while preserving review-only prescription authority", () => {
    const capability = clinicalDomainCapability("nutrition_support");
    expect(capability.executionState).toBe("review_only");
    expect(capability.evidenceAuthorities).toContain("ADA 2026 Section 5");
    expect(capability.boundary.toLocaleLowerCase()).toContain("diabetes alone cannot create");
    expect(capability.nextGap?.toLocaleLowerCase()).toContain("nutrient-specific");
  });

  it("records the dedicated pregnancy pathway without claiming autonomous pregnancy insulin dosing", () => {
    const capability = clinicalDomainCapability("pregnancy");
    expect(capability.executionState).toBe("safety_context");
    expect(capability.evidenceAuthorities).toContain("ADA 2026 Section 15");
    expect(capability.minimumSafeInputs.join(" ")).toContain("T1D/T2D/GDM");
    expect(capability.boundary).toContain("T1D insulin requirement");
    expect(capability.boundary).toContain("T2D insulin preference");
    expect(capability.boundary.toLocaleLowerCase()).toContain("non-autonomous");
    expect(capability.nextGap?.toLocaleLowerCase()).toContain("postpartum");
  });
});
