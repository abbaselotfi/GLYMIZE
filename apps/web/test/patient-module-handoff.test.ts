import { describe, expect, it } from "vitest";
import {
  createPatientModuleHandoffIntent,
  patientModuleSourceRevisionFingerprint,
  readPatientModuleHandoffIntent,
  writePatientModuleHandoffIntent,
} from "../lib/patient-module-handoff";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  raw() {
    return [...this.values.values()][0] ?? "";
  }
}

const revision = {
  factId: "observation-1",
  revision: 7,
  verification: "verified" as const,
  freshness: "unknown" as const,
};

describe("R28-07 patient module handoff transport", () => {
  it("stores only scope and revision metadata, never clinical values", () => {
    const storage = new MemoryStorage();
    const intent = createPatientModuleHandoffIntent({
      moduleId: "diabetes-type-2",
      practiceId: "practice-1",
      patientId: "patient-1",
      sourceRevisions: [revision],
    });

    expect(writePatientModuleHandoffIntent(intent, storage)).toBe(true);
    const serialized = storage.raw();

    expect(serialized).toContain("practice-1");
    expect(serialized).toContain("patient-1");
    expect(serialized).toContain("observation-1");
    expect(serialized).not.toContain("hba1c");
    expect(serialized).not.toContain("egfr");
    expect(serialized).not.toContain("potassium");
    expect(serialized).not.toContain("dose");
    expect(serialized).not.toContain("value");
  });

  it("round-trips an empty relevant-revision set without inventing source facts", () => {
    const storage = new MemoryStorage();
    const intent = createPatientModuleHandoffIntent({
      moduleId: "diabetes-type-2",
      practiceId: "practice-1",
      patientId: "patient-1",
      sourceRevisions: [],
    });

    expect(intent.sourceRevisionFingerprint).toBe("none");
    writePatientModuleHandoffIntent(intent, storage);

    expect(readPatientModuleHandoffIntent("diabetes-type-2", storage)).toEqual(intent);
  });

  it("fails closed and clears tampered fingerprints", () => {
    const storage = new MemoryStorage();
    const intent = createPatientModuleHandoffIntent({
      moduleId: "diabetes-type-2",
      practiceId: "practice-1",
      patientId: "patient-1",
      sourceRevisions: [revision],
    });
    storage.setItem(
      "glymize-patient-module-handoff-v1",
      JSON.stringify({ ...intent, sourceRevisionFingerprint: "tampered" }),
    );

    expect(readPatientModuleHandoffIntent("diabetes-type-2", storage)).toBeNull();
    expect(storage.raw()).toBe("");
  });

  it("rejects a descriptor for another module and removes it from the tab", () => {
    const storage = new MemoryStorage();
    const intent = createPatientModuleHandoffIntent({
      moduleId: "diabetes-type-2",
      practiceId: "practice-1",
      patientId: "patient-1",
      sourceRevisions: [revision],
    });
    writePatientModuleHandoffIntent(intent, storage);

    expect(readPatientModuleHandoffIntent("type-1", storage)).toBeNull();
    expect(storage.raw()).toBe("");
  });

  it("makes verification and freshness part of the source revision fingerprint", () => {
    const base = patientModuleSourceRevisionFingerprint([revision]);
    const unverified = patientModuleSourceRevisionFingerprint([
      { ...revision, verification: "unverified" },
    ]);
    const stale = patientModuleSourceRevisionFingerprint([
      { ...revision, freshness: "stale" },
    ]);

    expect(unverified).not.toBe(base);
    expect(stale).not.toBe(base);
  });
});
