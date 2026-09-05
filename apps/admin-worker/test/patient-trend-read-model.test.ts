import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPatientTrendSeries,
  type DecryptedTrendObservation,
} from "../src/patient-record-v2/trends";

function observation(
  input: Partial<DecryptedTrendObservation> & {
    observationId: string;
    encounterId: string;
    observedAt: string;
    value: number;
    unit?: string;
  },
): DecryptedTrendObservation {
  return {
    observationId: input.observationId,
    encounterId: input.encounterId,
    canonicalKey: input.canonicalKey ?? "hba1c",
    observedAt: input.observedAt,
    verification: input.verification ?? "confirmed",
    payload: {
      canonicalName: input.payload?.canonicalName ?? "HbA1c",
      value: input.value,
      unit: input.unit,
      specimen: input.payload?.specimen,
      interpretation: input.payload?.interpretation,
    },
  };
}

describe("Patient Record v2 longitudinal trend read model", () => {
  it("builds a chart only from at least two confirmed compatible measurements", () => {
    const series = buildPatientTrendSeries([
      observation({
        observationId: "o2",
        encounterId: "e2",
        observedAt: "2026-06-01T08:00:00.000Z",
        value: 7.1,
        unit: "%",
      }),
      observation({
        observationId: "o1",
        encounterId: "e1",
        observedAt: "2026-03-01T08:00:00.000Z",
        value: 7.8,
        unit: "%",
      }),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0]?.chartEligible).toBe(true);
    expect(series[0]?.points.map((point) => point.observationId)).toEqual([
      "o1",
      "o2",
    ]);
    expect(series[0]?.points.map((point) => point.encounterId)).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("does not treat unverified or rejected observations as trusted chart evidence", () => {
    const series = buildPatientTrendSeries([
      observation({
        observationId: "confirmed",
        encounterId: "e1",
        observedAt: "2026-03-01T08:00:00.000Z",
        value: 7.8,
        unit: "%",
      }),
      observation({
        observationId: "unverified",
        encounterId: "e2",
        observedAt: "2026-06-01T08:00:00.000Z",
        value: 7.1,
        unit: "%",
        verification: "unverified",
      }),
      observation({
        observationId: "rejected",
        encounterId: "e3",
        observedAt: "2026-09-01T08:00:00.000Z",
        value: 6.4,
        unit: "%",
        verification: "rejected",
      }),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0]?.chartEligible).toBe(false);
    expect(series[0]?.points.map((point) => point.observationId)).toEqual([
      "confirmed",
      "unverified",
    ]);
  });

  it("keeps incompatible units and specimens in separate series without numeric conversion", () => {
    const series = buildPatientTrendSeries([
      observation({
        observationId: "mg1",
        encounterId: "e1",
        observedAt: "2026-01-01T08:00:00.000Z",
        canonicalKey: "glucose",
        value: 126,
        unit: "mg/dl",
        payload: { canonicalName: "Glucose", specimen: "serum" },
      }),
      observation({
        observationId: "mg2",
        encounterId: "e2",
        observedAt: "2026-02-01T08:00:00.000Z",
        canonicalKey: "glucose",
        value: 118,
        unit: "mg/dL",
        payload: { canonicalName: "Glucose", specimen: "Serum" },
      }),
      observation({
        observationId: "mmol",
        encounterId: "e3",
        observedAt: "2026-03-01T08:00:00.000Z",
        canonicalKey: "glucose",
        value: 6.3,
        unit: "mmol/L",
        payload: { canonicalName: "Glucose", specimen: "serum" },
      }),
      observation({
        observationId: "urine",
        encounterId: "e4",
        observedAt: "2026-04-01T08:00:00.000Z",
        canonicalKey: "glucose",
        value: 15,
        unit: "mg/dL",
        payload: { canonicalName: "Glucose", specimen: "urine" },
      }),
    ]);

    expect(series).toHaveLength(3);
    const serumMg = series.find(
      (item) => item.unit === "mg/dL" && item.specimen === "serum",
    );
    expect(serumMg?.chartEligible).toBe(true);
    expect(serumMg?.points.map((point) => point.value)).toEqual([126, 118]);
    expect(series.find((item) => item.unit === "mmol/L")?.chartEligible).toBe(false);
    expect(series.find((item) => item.specimen === "urine")?.chartEligible).toBe(false);
  });

  it("excludes unmapped raw observations from canonical chart candidates", () => {
    const series = buildPatientTrendSeries([
      observation({
        observationId: "raw1",
        encounterId: "e1",
        observedAt: "2026-01-01T08:00:00.000Z",
        canonicalKey: "raw:unknown-test",
        value: 1,
        unit: "mg/dL",
      }),
    ]);

    expect(series).toEqual([]);
  });

  it("reads only the latest snapshot revision and wires the result into Patient Workspace", () => {
    const trendSource = fs.readFileSync(
      new URL("../src/patient-record-v2/trends.ts", import.meta.url),
      "utf8",
    );
    const routeSource = fs.readFileSync(
      new URL("../src/platform-patient-record-v2.ts", import.meta.url),
      "utf8",
    );

    expect(trendSource).toContain("o.snapshot_revision=(");
    expect(trendSource).toContain("SELECT MAX(s.revision)");
    expect(trendSource).toContain("o.canonical_key NOT LIKE 'raw:%'");
    expect(trendSource).not.toContain("mg/dLToMmol");
    expect(trendSource).not.toContain("mmolToMg");
    expect(routeSource).toContain("readPatientTrendSeries(context, patientId)");
    expect(routeSource).not.toContain("trends: [],");
  });
});
