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
const timelineReader = fs.readFileSync(
  new URL("../src/patient-core/timeline-reader.ts", import.meta.url),
  "utf8",
);
const timelineOrderReader = fs.readFileSync(
  new URL("../src/patient-core/timeline-order-reader.ts", import.meta.url),
  "utf8",
);
const pagination = fs.readFileSync(
  new URL("../src/patient-core/pagination.ts", import.meta.url),
  "utf8",
);
const projectionCoverage = fs.readFileSync(
  new URL("../src/patient-core/projection-coverage.ts", import.meta.url),
  "utf8",
);
const historicalCore = fs.readFileSync(
  new URL("../src/platform-patient-record-v2-core.ts", import.meta.url),
  "utf8",
);

describe("Patient Clinical Core bounded read-model boundary", () => {
  it("routes summary and continuation through the Patient Core facade with the existing read authorization", () => {
    expect(facade).toContain('from "./patient-core/route"');
    expect(facade).toContain("patientClinicalCoreRoute(request, context)");
    expect(route).toContain("/longitudinal");
    expect(route).toContain("/longitudinal\\/history");
    expect(route).toContain('context.authorize("patient_record.workspace.read")');
    expect(route).toContain('context.user.permissions.includes("handoff.read")');
  });

  it("keeps recent snapshot projection on the latest immutable revision", () => {
    expect(snapshotReader).toContain("SELECT MAX(s2.revision)");
    expect(snapshotReader).toContain("s2.practice_id=e.practice_id");
    expect(snapshotReader).toContain("s2.patient_id=e.patient_id");
    expect(snapshotReader).toContain("s2.encounter_id=e.id");
    expect(snapshotReader).toContain("e.practice_id=? AND e.patient_id=?");
  });

  it("bounds the observation universe and preserves explicit coverage accounting", () => {
    expect(observationReader).toContain('"latest_snapshot_revision_per_encounter"');
    expect(observationReader).toContain("COUNT(*) AS source_row_count");
    expect(observationReader).toContain("o.verification<>'rejected'");
    expect(observationReader).toContain("substr(o.canonical_key,1,4)<>'raw:'");
    expect(observationReader).toContain("o.created_at<=?");
    expect(observationReader).toContain("MAX(s.revision)");
    expect(observationReader).toContain("LIMIT ?");
    expect(observationReader).toContain("completenessFromPatientCoreDiagnostics");
    expect(projectionCoverage).toContain("PATIENT_CORE_COVERAGE_ACCOUNTING_INVALID");
  });

  it("uses bounded, tamper-evident cursor traversal for observations and heterogeneous timeline sources", () => {
    expect(pagination).toContain("PATIENT_CORE_DEFAULT_OBSERVATION_PAGE_SIZE = 80");
    expect(pagination).toContain("PATIENT_CORE_DEFAULT_TIMELINE_PAGE_SIZE = 60");
    expect(pagination).toContain("PATIENT_CORE_MAX_PAGE_SIZE = 200");
    expect(pagination).toContain("hmacHex");
    expect(pagination).toContain("constantTimeEqual");
    expect(timelineReader).toContain("candidateLimit = limit + 1");
    expect(timelineReader).toContain("readPatientCoreTimelineOrders");
    expect(timelineOrderReader).toContain("p.plan_status IN ('signed','superseded','void')");
    expect(timelineOrderReader).toContain("p.signed_at<=?");
    expect(timelineOrderReader).toContain("f.created_at<=?");
    expect(timelineOrderReader).toContain("l.linked_at<=?");
  });

  it("keeps decryption AADs equivalent to the established Patient Record v2 authority", () => {
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
