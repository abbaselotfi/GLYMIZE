import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";
import {
  patientCoreAllergyProblemAuthorityEnabledFromEnv,
} from "../src/patient-core-rollout";

const readers = vi.hoisted(() => ({
  summary: vi.fn(),
  snapshots: vi.fn(),
  observations: vi.fn(),
  timeline: vi.fn(),
  allergies: vi.fn(),
  problems: vi.fn(),
  emptyContext: vi.fn(),
  projectSnapshot: vi.fn(),
  compareContexts: vi.fn(),
  unavailableChanges: vi.fn(),
}));

vi.mock("../src/patient-core/patient-summary-reader", () => ({
  readPatientCoreSummary: readers.summary,
}));

vi.mock("../src/patient-core/snapshot-reader", () => ({
  readRecentPatientCoreSnapshots: readers.snapshots,
}));

vi.mock("../src/patient-core/observation-reader", () => ({
  readPatientCoreObservations: readers.observations,
}));

vi.mock("../src/patient-core/timeline-reader", () => ({
  readPatientCoreTimeline: readers.timeline,
}));

vi.mock("../src/patient-core/authority-repository", () => ({
  readPatientCoreAllergies: readers.allergies,
  readPatientCoreProblems: readers.problems,
}));

vi.mock("../src/patient-core/projection", () => ({
  emptyPatientContext: readers.emptyContext,
  projectSnapshotContext: readers.projectSnapshot,
}));

vi.mock("../src/patient-core/change-detection", () => ({
  comparePatientContexts: readers.compareContexts,
  unavailablePatientChangeSet: readers.unavailableChanges,
}));

import { readPatientLongitudinalModel } from "../src/patient-core/read-model";

const fallbackAllergies = {
  completeness: "partial",
  gapReason: "not_collected",
  items: [{ factId: "snapshot-allergy" }],
};

const fallbackProblems = {
  completeness: "partial",
  gapReason: "not_collected",
  items: [{ factId: "snapshot-problem" }],
};

const authorityAllergies = {
  completeness: "complete",
  items: [{ factId: "authority-allergy" }],
};

const authorityProblems = {
  completeness: "complete",
  items: [{ factId: "authority-problem" }],
};

function routeContext() {
  return {
    user: {
      practiceId: "practice-1",
    },
  } as unknown as PatientRecordV2RouteContext;
}

beforeEach(() => {
  vi.clearAllMocks();

  readers.summary.mockResolvedValue({ id: "patient-1" });
  readers.snapshots.mockResolvedValue([]);
  readers.observations.mockResolvedValue({
    completeness: "complete",
    items: [],
  });
  readers.timeline.mockResolvedValue({
    completeness: "complete",
    items: [],
  });
  readers.emptyContext.mockReturnValue({
    allergies: fallbackAllergies,
    problems: fallbackProblems,
  });
  readers.unavailableChanges.mockReturnValue({
    available: false,
  });
  readers.allergies.mockResolvedValue(authorityAllergies);
  readers.problems.mockResolvedValue(authorityProblems);
});

describe("R28-06 Allergy/Problem rollout boundary", () => {
  it("fails closed for every value except explicit string true", () => {
    expect(patientCoreAllergyProblemAuthorityEnabledFromEnv("true")).toBe(true);
    expect(patientCoreAllergyProblemAuthorityEnabledFromEnv(" TRUE ")).toBe(true);

    for (const value of [
      undefined,
      null,
      "",
      "false",
      "1",
      "yes",
      true,
      false,
      1,
    ]) {
      expect(patientCoreAllergyProblemAuthorityEnabledFromEnv(value)).toBe(false);
    }
  });

  it("does not invoke the new authority readers while rollout is disabled", async () => {
    const result = await readPatientLongitudinalModel(
      routeContext(),
      "patient-1",
    );

    expect(readers.allergies).not.toHaveBeenCalled();
    expect(readers.problems).not.toHaveBeenCalled();

    expect(result?.context.allergies).toBe(fallbackAllergies);
    expect(result?.context.problems).toBe(fallbackProblems);
  });

  it("replaces snapshot-projected Allergy/Problem collections only when enabled", async () => {
    const result = await readPatientLongitudinalModel(
      routeContext(),
      "patient-1",
      {
        allergyProblemAuthorityEnabled: true,
      },
    );

    expect(readers.allergies).toHaveBeenCalledTimes(1);
    expect(readers.problems).toHaveBeenCalledTimes(1);

    expect(result?.context.allergies).toBe(authorityAllergies);
    expect(result?.context.problems).toBe(authorityProblems);
  });

  it("threads the operational flag outside Patient Record v2 persistence context", () => {
    const platformIndex = fs.readFileSync(
      new URL("../src/platform-index.ts", import.meta.url),
      "utf8",
    );
    const facade = fs.readFileSync(
      new URL("../src/platform-patient-record-v2.ts", import.meta.url),
      "utf8",
    );
    const clinicalCoreRoute = fs.readFileSync(
      new URL("../src/patient-core/route.ts", import.meta.url),
      "utf8",
    );
    const authorityRoute = fs.readFileSync(
      new URL("../src/patient-core/authority-route.ts", import.meta.url),
      "utf8",
    );
    const patientRecordContext = fs.readFileSync(
      new URL("../src/patient-record-v2/context.ts", import.meta.url),
      "utf8",
    );
    const wrangler = fs.readFileSync(
      new URL("../wrangler.jsonc", import.meta.url),
      "utf8",
    );

    expect(platformIndex).toContain(
      "PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ENABLED?: string;",
    );
    expect(platformIndex).toContain(
      "patientCoreAllergyProblemAuthorityEnabledFromEnv(",
    );
    expect(facade).toContain(
      "patientCoreAllergyProblemAuthorityEnabled?: boolean;",
    );
    expect(clinicalCoreRoute).toContain(
      "allergyProblemAuthorityEnabled?: boolean;",
    );
    expect(authorityRoute).toContain("enabled = false");
    expect(authorityRoute).toContain("if (!enabled) return null;");
    expect(patientRecordContext).not.toContain(
      "PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ENABLED",
    );
    expect(patientRecordContext).not.toContain(
      "patientCoreAllergyProblemAuthorityEnabled",
    );
    expect(wrangler).toContain(
      '"PATIENT_CORE_ALLERGY_PROBLEM_AUTHORITY_ENABLED": "false"',
    );
  });
});
