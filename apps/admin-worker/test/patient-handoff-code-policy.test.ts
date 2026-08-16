import { describe, expect, it } from "vitest";
import {
  buildSequentialFileCodeCandidates,
  resolvePatientHandoffWriteMode,
} from "../src/patient-handoff-code-policy";

describe("patient handoff file-code policy", () => {
  it("defaults missing/legacy write intent to create-only", () => {
    expect(resolvePatientHandoffWriteMode(undefined)).toBe("create");
    expect(resolvePatientHandoffWriteMode(null)).toBe("create");
    expect(resolvePatientHandoffWriteMode("")).toBe("create");
    expect(resolvePatientHandoffWriteMode("create")).toBe("create");
    expect(resolvePatientHandoffWriteMode("update")).toBe("update");
    expect(resolvePatientHandoffWriteMode("overwrite")).toBeNull();
  });

  it("suggests sequential numeric file codes", () => {
    expect(buildSequentialFileCodeCandidates("1003", 3)).toEqual([
      "1004",
      "1005",
      "1006",
    ]);
  });

  it("preserves leading-zero width", () => {
    expect(buildSequentialFileCodeCandidates("0099", 2)).toEqual([
      "0100",
      "0101",
    ]);
  });

  it("does not manufacture suggestions for non-numeric identifiers", () => {
    expect(buildSequentialFileCodeCandidates("A1003", 3)).toEqual([]);
  });

  it("keeps probing bounded", () => {
    expect(buildSequentialFileCodeCandidates("1", 500)).toHaveLength(128);
  });
});
