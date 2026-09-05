import { describe, expect, it } from "vitest";

import { apiFetch } from "../lib/api-client";

describe("api-client browser-owned routing", () => {
  it("returns a structured 404 for an unknown local API route", async () => {
    const response = await apiFetch("/v1/admin/catalog/not-a-real-route");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "مسیر محلی شناخته نشد.",
    });
  });

  it("returns the shared parallel-safety projection from the local Type 2 fallback", async () => {
    const response = await apiFetch("/v1/catalog/type-2/considerations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentHba1c: 7.8,
        targetHba1c: 7,
        factors: ["pregnancy", "diabetic_foot"],
        clinicalContext: {
          pregnancy: true,
          glycemia: { fastingPlasmaGlucoseMgDl: 101 },
          pregnancyCare: { diabetesType: "gdm", gestationalAgeWeeks: 28 },
          diabeticFoot: { footUlcerPresent: true, clinicalInfectionPresent: false },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json() as {
      parallelSafety?: {
        diabeticFoot?: { state?: string; antibioticExecution?: boolean };
        pregnancy?: { state?: string; autonomousInsulinDoseExecution?: boolean };
      };
    };
    expect(result.parallelSafety?.diabeticFoot).toMatchObject({
      state: "uninfected_ulcer",
      antibioticExecution: false,
    });
    expect(result.parallelSafety?.pregnancy).toMatchObject({
      state: "gdm_lifestyle_then_insulin_if_needed",
      autonomousInsulinDoseExecution: false,
    });
  });
});
