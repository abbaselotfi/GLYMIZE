import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { PatientHandoffRecord } from "@glymize/contracts";
import { buildPatientVisitChangeSummary } from "../lib/patient-visit-change-summary";

function record(
  input: Partial<PatientHandoffRecord> & { id: string; updatedAt: string },
): PatientHandoffRecord {
  return {
    id: input.id,
    patientCodeKind: "file_number",
    patientCodeDisplay: "••12",
    status: "reviewed",
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
    revision: 1,
    vitals: input.vitals ?? {},
    clinicalFlags: input.clinicalFlags ?? {},
    labs: input.labs ?? [],
    medications: input.medications ?? [],
  };
}

describe("deterministic What changed since last visit", () => {
  it("reports exact vital and confirmed compatible lab differences without interpretation", () => {
    const previous = record({
      id: "previous",
      updatedAt: "2026-01-01T08:00:00.000Z",
      vitals: { weightKg: 80, systolicBp: 130, diastolicBp: 80, pulseBpm: 70 },
      labs: [{
        id: "a1c-prev",
        canonicalKey: "hba1c",
        canonicalName: "HbA1c",
        rawName: "HbA1c",
        value: 8.1,
        unit: "%",
        specimen: "blood",
        verification: "confirmed",
      }],
    });
    const current = record({
      id: "current",
      updatedAt: "2026-04-01T08:00:00.000Z",
      vitals: { weightKg: 78, systolicBp: 124, diastolicBp: 78, pulseBpm: 72 },
      labs: [{
        id: "a1c-current",
        canonicalKey: "hba1c",
        canonicalName: "HbA1c",
        rawName: "HbA1c",
        value: 7.4,
        unit: "%",
        specimen: "Blood",
        verification: "confirmed",
      }],
    });

    const summary = buildPatientVisitChangeSummary(current, previous);
    expect(summary.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "vital", key: "weight", previousValue: "80", currentValue: "78" }),
      expect.objectContaining({ kind: "vital", key: "blood_pressure", previousValue: "130/80", currentValue: "124/78" }),
      expect.objectContaining({ kind: "vital", key: "pulse", previousValue: "70", currentValue: "72" }),
      expect.objectContaining({ kind: "lab", label: "HbA1c", previousValue: 8.1, currentValue: 7.4, unit: "%" }),
    ]));
  });

  it("does not compare unverified, rejected, unit-incompatible, specimen-incompatible, or ambiguous duplicate labs", () => {
    const previous = record({
      id: "previous",
      updatedAt: "2026-01-01T08:00:00.000Z",
      labs: [
        { id: "g1", canonicalKey: "glucose", canonicalName: "Glucose", rawName: "Glucose", value: 126, unit: "mg/dL", specimen: "serum", verification: "confirmed" },
        { id: "dup1", canonicalKey: "creatinine", canonicalName: "Creatinine", rawName: "Cr", value: 1.0, unit: "mg/dL", verification: "confirmed" },
        { id: "dup2", canonicalKey: "creatinine", canonicalName: "Creatinine", rawName: "Cr", value: 1.1, unit: "mg/dL", verification: "confirmed" },
      ],
    });
    const current = record({
      id: "current",
      updatedAt: "2026-04-01T08:00:00.000Z",
      labs: [
        { id: "g2", canonicalKey: "glucose", canonicalName: "Glucose", rawName: "Glucose", value: 7, unit: "mmol/L", specimen: "serum", verification: "confirmed" },
        { id: "g3", canonicalKey: "glucose", canonicalName: "Glucose", rawName: "Glucose", value: 120, unit: "mg/dL", specimen: "urine", verification: "confirmed" },
        { id: "g4", canonicalKey: "glucose", canonicalName: "Glucose", rawName: "Glucose", value: 118, unit: "mg/dL", specimen: "serum", verification: "unverified" },
        { id: "cr", canonicalKey: "creatinine", canonicalName: "Creatinine", rawName: "Cr", value: 1.2, unit: "mg/dL", verification: "confirmed" },
      ],
    });

    expect(buildPatientVisitChangeSummary(current, previous).changes).toEqual([]);
  });

  it("reports only confirmed medication additions/removals/detail changes", () => {
    const previous = record({
      id: "previous",
      updatedAt: "2026-01-01T08:00:00.000Z",
      medications: [
        { genericMedicationId: "metformin", genericName: "Metformin", doseAmount: 500, doseUnit: "mg", frequencyPerDay: 2, verification: "confirmed" },
        { genericMedicationId: "old", genericName: "Old med", doseAmount: 10, doseUnit: "mg", verification: "confirmed" },
        { genericMedicationId: "noise", genericName: "Noise", verification: "unverified" },
      ],
    });
    const current = record({
      id: "current",
      updatedAt: "2026-04-01T08:00:00.000Z",
      medications: [
        { genericMedicationId: "metformin", genericName: "Metformin", doseAmount: 1000, doseUnit: "mg", frequencyPerDay: 2, verification: "confirmed" },
        { genericMedicationId: "new", genericName: "New med", doseAmount: 5, doseUnit: "mg", verification: "confirmed" },
        { genericMedicationId: "noise2", genericName: "Noise two", verification: "rejected" },
      ],
    });

    const medicationChanges = buildPatientVisitChangeSummary(current, previous).changes
      .filter((item) => item.kind === "medication");
    expect(medicationChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Metformin", change: "changed" }),
      expect.objectContaining({ label: "Old med", change: "removed" }),
      expect.objectContaining({ label: "New med", change: "added" }),
    ]));
    expect(medicationChanges).toHaveLength(3);
  });

  it("contains no clinical judgement or LLM path in the projection", () => {
    const source = fs.readFileSync(
      new URL("../lib/patient-visit-change-summary.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/better|worse|improv|deterior|causality|clinical significance/i);
    expect(source).not.toContain("clinicalEngine");
    expect(source).not.toContain("fetch(");
  });
});
