import { describe, expect, it } from "vitest";
import {
  resolveDiabeticFootPathwayV2,
  runDecisionGraphV2WithSpecialistEscalations,
  type DecisionGraphRequestWithSpecialistContextsV2,
  type DiabeticFootContextV2,
} from "../src/decision-graph-v2/index.js";

function request(diabeticFoot?: DiabeticFootContextV2): DecisionGraphRequestWithSpecialistContextsV2 {
  return {
    patient: {
      ageYears: 62,
      glycemia: { currentHba1c: 7, targetHba1c: 7 },
      diabeticFoot,
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [],
      marketProducts: [],
      doseRules: [],
      insurancePolicies: [],
    },
  };
}

describe("IWGDF/IDSA 2023 diabetic-foot escalation boundary", () => {
  it("requires a clinical infection assessment before any antibiotic path", () => {
    const result = resolveDiabeticFootPathwayV2(request({ footUlcerPresent: true }));
    expect(result.state).toBe("needs_infection_assessment");
    expect(result.antibioticExecution).toBe(false);
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "diabeticFoot.clinicalInfectionPresent", priority: "required" }),
    ]));
  });

  it("explicitly blocks antibiotic execution for a clinically uninfected ulcer", () => {
    const result = resolveDiabeticFootPathwayV2(request({
      footUlcerPresent: true,
      clinicalInfectionPresent: false,
    }));
    expect(result.state).toBe("uninfected_ulcer");
    expect(result.antibioticExecution).toBe(false);
    expect(result.antibioticBoundary).toBe("not_indicated_for_uninfected_ulcer");
    expect(result.evidence.some((item) => item.locator === "Recommendation 11")).toBe(true);
  });

  it("requires IWGDF/IDSA severity after clinical infection is confirmed", () => {
    const result = resolveDiabeticFootPathwayV2(request({
      footUlcerPresent: true,
      clinicalInfectionPresent: true,
      infectionSeverity: "unknown",
    }));
    expect(result.state).toBe("infected_needs_severity");
    expect(result.antibioticExecution).toBe(false);
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "diabeticFoot.infectionSeverity", priority: "required" }),
    ]));
  });

  it("keeps a mild infection in review without fabricating an antibiotic", () => {
    const result = resolveDiabeticFootPathwayV2(request({
      footUlcerPresent: true,
      clinicalInfectionPresent: true,
      infectionSeverity: "mild",
    }));
    expect(result.state).toBe("infected_mild");
    expect(result.antibioticExecution).toBe(false);
    expect(result.antibioticBoundary).toBe("requires_severity_pathogen_patient_and_local_protocol_review");
    expect(result.escalations).toHaveLength(0);
  });

  it("creates urgent surgical escalation for severe DFI", () => {
    const result = resolveDiabeticFootPathwayV2(request({
      footUlcerPresent: true,
      clinicalInfectionPresent: true,
      infectionSeverity: "severe",
      peripheralArteryDisease: false,
    }));
    expect(result.state).toBe("infected_severe");
    expect(result.antibioticExecution).toBe(false);
    expect(result.escalations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "DFI-SEVERE-HOSPITAL-CONSIDERATION", urgency: "urgent" }),
      expect.objectContaining({ id: "DFI-URGENT-SURGICAL-CONSULT", urgency: "urgent" }),
    ]));
  });

  it("creates urgent surgical escalation for moderate DFI with a guideline danger feature", () => {
    const result = resolveDiabeticFootPathwayV2(request({
      footUlcerPresent: true,
      clinicalInfectionPresent: true,
      infectionSeverity: "moderate",
      deepAbscessSuspected: true,
      peripheralArteryDisease: false,
    }));
    expect(result.escalations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "DFI-URGENT-SURGICAL-CONSULT" }),
    ]));
    expect(result.actions.join(" ")).toContain("24–48");
  });

  it("adds urgent surgical and vascular consultation when infection and PAD coexist with ulcer", () => {
    const result = resolveDiabeticFootPathwayV2(request({
      footUlcerPresent: true,
      clinicalInfectionPresent: true,
      infectionSeverity: "moderate",
      peripheralArteryDisease: true,
    }));
    expect(result.escalations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "DFI-PAD-SURGICAL-VASCULAR-CONSULT",
        destinations: expect.arrayContaining(["surgical", "vascular"]),
      }),
    ]));
  });

  it("adds osteomyelitis diagnostic actions but still does not select antibiotics", () => {
    const result = resolveDiabeticFootPathwayV2(request({
      footUlcerPresent: true,
      clinicalInfectionPresent: true,
      infectionSeverity: "moderate",
      osteomyelitisSuspected: true,
      peripheralArteryDisease: false,
    }));
    expect(result.actions.join(" ")).toMatch(/probe-to-bone/i);
    expect(result.actions.join(" ")).toContain("MRI");
    expect(result.antibioticExecution).toBe(false);
  });

  it("projects the foot pathway through the specialist wrapper outside medication ranking", () => {
    const result = runDecisionGraphV2WithSpecialistEscalations(request({
      footUlcerPresent: true,
      clinicalInfectionPresent: false,
    }));
    expect(result.diabeticFootPathway.state).toBe("uninfected_ulcer");
    expect(result.diabeticFootPathway.antibioticExecution).toBe(false);
    const footTrace = result.trace.find((item) => item.nodeId === "diabetic-foot-safety-escalation");
    expect(footTrace).toBeDefined();
    expect(footTrace?.summary).toContain("antibioticExecution=false");
  });
});
