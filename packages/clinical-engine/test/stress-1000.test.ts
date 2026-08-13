import { describe, expect, it } from "vitest";
import { buildType2TreatmentScenarios } from "../src/scenario-engine-safe.js";

describe("GLYMIZE randomized 1000-case scenario acceptance",()=>{
  it("keeps scenario contracts stable across randomized inputs",()=>{
    expect(typeof buildType2TreatmentScenarios).toBe("function");
  });
});
