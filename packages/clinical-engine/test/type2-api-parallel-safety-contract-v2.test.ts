import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const controllerPath = fileURLToPath(
  new URL("../../../apps/api/src/catalog/catalog.controller.ts", import.meta.url),
);
const controller = readFileSync(controllerPath, "utf8");
const runtimePath = fileURLToPath(
  new URL("../src/type2-decision-graph-runtime.ts", import.meta.url),
);
const runtime = readFileSync(runtimePath, "utf8");

describe("Type 2 API parallel-safety contract", () => {
  it("accepts the structured request and delegates the complete assessment to shared runtime authority", () => {
    expect(controller).toContain("Type2StructuredConsiderationRequestV2");
    expect(controller).toContain("return this.catalogService.listType2MedicationConsiderations(request)");
    expect(controller).not.toContain("resolveType2ParallelSafetyProjectionV2");
    expect(runtime).toContain("resolveType2ParallelSafetyProjectionV2");
    expect(runtime).toContain("parallelSafety:");
  });

  it("keeps Decision Graph medication execution out of the controller projection boundary", () => {
    expect(controller).not.toContain("runDecisionGraphV2(");
    expect(controller).not.toContain("runDecisionGraphV2WithSpecialistEscalations(");
    expect(controller).not.toContain("buildType2Assessment(");
  });

  it("does not create a second medication or ranking property in the controller", () => {
    const methodStart = controller.indexOf("type2MedicationConsiderations(");
    const methodEnd = controller.indexOf("@Get(\"admin/preview/type-2-considerations\")", methodStart);
    const method = controller.slice(methodStart, methodEnd);
    expect(method).not.toContain("medications:");
    expect(method).not.toContain("ranking:");
    expect(method).not.toContain("candidates:");
    expect(method).not.toContain("parallelSafety:");
  });
});
