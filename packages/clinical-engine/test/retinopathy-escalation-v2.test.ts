import { describe, expect, it } from "vitest";
import {
  resolveRetinopathySpecialistEscalationV2,
  runDecisionGraphV2WithSpecialistEscalations,
  type DecisionGraphRequestWithRetinopathyV2,
} from "../src/decision-graph-v2/index.js";

function request(
  retinopathy: DecisionGraphRequestWithRetinopathyV2["patient"]["retinopathy"],
  pregnancy = false,
): DecisionGraphRequestWithRetinopathyV2 {
  return {
    patient: {
      ageYears: 60,
      pregnancy,
      glycemia: { currentHba1c: 7, targetHba1c: 7 },
      retinopathy,
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

describe("ADA 2026 retinopathy specialist escalation", () => {
  it.each([
    ["moderate NPDR", { diabeticRetinopathyPresent: true, severity: "moderate_npdr" as const, diabeticMacularEdema: false }],
    ["severe NPDR", { diabeticRetinopathyPresent: true, severity: "severe_npdr" as const, diabeticMacularEdema: false }],
    ["PDR", { diabeticRetinopathyPresent: true, severity: "pdr" as const, diabeticMacularEdema: false }],
    ["any DME", { diabeticRetinopathyPresent: true, severity: "mild_npdr" as const, diabeticMacularEdema: true }],
  ])("creates prompt ophthalmology escalation for %s", (_label, context) => {
    const result = resolveRetinopathySpecialistEscalationV2(request(context));
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]).toMatchObject({
      lane: "retinopathy",
      specialty: "ophthalmology",
      urgency: "prompt",
      clinicianActionRequired: true,
      autonomousMedicationExecution: false,
    });
    expect(result.escalations[0]!.evidence.some((item) => item.locator === "Recommendation 12.9")).toBe(true);
  });

  it("does not invent a prompt treatment escalation for mild NPDR without DME", () => {
    const result = resolveRetinopathySpecialistEscalationV2(request({
      diabeticRetinopathyPresent: true,
      severity: "mild_npdr",
      diabeticMacularEdema: false,
    }));
    expect(result.escalations).toHaveLength(0);
  });

  it("asks for severity/DME characterization without blocking the unrelated glycemic decision", () => {
    const result = resolveRetinopathySpecialistEscalationV2(request({
      diabeticRetinopathyPresent: true,
      severity: "unknown",
    }));
    expect(result.escalations).toHaveLength(0);
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "retinopathy.severityAndDme",
        priority: "recommended",
        blocksFinalDecision: false,
      }),
    ]));
  });

  it("keeps center-involving DME treatment evidence specialist-only", () => {
    const result = resolveRetinopathySpecialistEscalationV2(request({
      diabeticRetinopathyPresent: true,
      severity: "moderate_npdr",
      diabeticMacularEdema: true,
      centerInvolvingDme: true,
      visualAcuityImpairmentAttributedToDme: true,
    }));
    const escalation = result.escalations[0]!;
    expect(escalation.autonomousMedicationExecution).toBe(false);
    expect(escalation.treatmentEvidenceNotes.join(" ").toLocaleLowerCase()).toContain("anti-vegf");
    expect(escalation.evidence.some((item) => item.locator === "Recommendations 12.10-12.13")).toBe(true);
  });

  it("adds pregnancy-aware eye evidence without converting it into intravitreal prescribing authority", () => {
    const result = resolveRetinopathySpecialistEscalationV2(request({
      diabeticRetinopathyPresent: true,
      severity: "pdr",
      diabeticMacularEdema: false,
    }, true));
    const escalation = result.escalations[0]!;
    expect(escalation.evidence.some((item) => item.locator === "Recommendations 12.7-12.8")).toBe(true);
    expect(escalation.autonomousMedicationExecution).toBe(false);
  });

  it("appends retinopathy escalation outside the core medication ranking channel", () => {
    const result = runDecisionGraphV2WithSpecialistEscalations(request({
      diabeticRetinopathyPresent: true,
      severity: "pdr",
      diabeticMacularEdema: false,
    }));
    expect(result.specialistEscalations).toHaveLength(1);
    expect(result.specialistEscalations[0]!.autonomousMedicationExecution).toBe(false);
    const retinopathyTrace = result.trace.find((item) => item.nodeId === "retinopathy-specialist-escalation");
    expect(retinopathyTrace).toBeDefined();
    expect(retinopathyTrace?.summary).toContain("outside medication ranking");
  });
});
