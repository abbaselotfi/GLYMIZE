import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  patientDemographicsAad,
  patientObservationAad,
  patientSnapshotAad,
} from "../src/patient-core/aad";

const facade = fs.readFileSync(
  new URL("../src/platform-patient-record-v2.ts", import.meta.url),
  "utf8",
);
const route = fs.readFileSync(
  new URL("../src/patient-core/route.ts", import.meta.url),
  "utf8",
);
const snapshotReader = fs.readFileSync(
  new URL("../src/patient-core/snapshot-reader.ts", import.meta.url),
  "utf8",
);
const observationReader = fs.readFileSync(
  new URL("../src/patient-core/observation-reader.ts", import.meta.url),
  "utf8",
);
const historicalCore = fs.readFileSync(
  new URL("../src/platform-patient-record-v2-core.ts", import.meta.url),
  "utf8",
);

describe("Patient Clinical Core B3 read-model boundary", () => {
  it("routes the longitudinal projection through the small facade before the historical core", () => {
    expect(facade).toContain('from "./patient-core/route"');
    expect(facade).toContain("patientClinicalCoreRoute(request, context)");
    expect(route).toContain("/longitudinal");
    expect(route).toContain('context.authorize("patient_record.workspace.read")');
    expect(route).toContain('context.user.permissions.includes("handoff.read")');
  });

  it("reads only latest immutable snapshot revisions for recent encounter projections", () => {
    expect(snapshotReader).toContain("SELECT MAX(s2.revision)");
    expect(snapshotReader).toContain("s2.practice_id=e.practice_id");
    expect(snapshotReader).toContain("s2.patient_id=e.patient_id");
    expect(snapshotReader).toContain("s2.encounter_id=e.id");
    expect(snapshotReader).toContain("e.practice_id=? AND e.patient_id=?");
  });

  it("keeps longitudinal observations on the latest snapshot revision and ignores rejected/raw facts", () => {
    expect(observationReader).toContain("o.verification<>'rejected'");
    expect(observationReader).toContain("o.canonical_key NOT LIKE 'raw:%'");
    expect(observationReader).toContain("o.snapshot_revision=(");
    expect(observationReader).toContain("MAX(s.revision)");
  });

  it("keeps B3 decryption AADs equivalent to the established Patient Record v2 authority", () => {
    expect(patientDemographicsAad("practice", "patient")).toBe(
      "patient-demographics:practice:patient",
    );
    expect(patientSnapshotAad("practice", "encounter", 3)).toBe(
      "patient-snapshot:practice:encounter:3",
    );
    expect(patientObservationAad("practice", "observation")).toBe(
      "patient-observation:practice:observation",
    );
    expect(historicalCore).toContain("patient-demographics:${practiceId}:${patientId}");
    expect(historicalCore).toContain("patient-snapshot:${practiceId}:${encounterId}:${revision}");
    expect(historicalCore).toContain("patient-observation:${practiceId}:${observationId}");
  });
});
