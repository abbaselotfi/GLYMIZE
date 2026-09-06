import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const webRoot = path.resolve(__dirname, "..");
const webSource = fs.readFileSync(
  path.join(webRoot, "app/type-2/type2-scenarios-client.tsx"),
  "utf8",
);
const apiSource = fs.readFileSync(
  path.resolve(webRoot, "../api/src/catalog/catalog.service.ts"),
  "utf8",
);

describe("Type 2 selected insurer wiring", () => {
  it("sends the selected insurer with the authoritative consideration request", () => {
    expect(webSource).toContain("costPreference,\n      routePreference,\n      insuranceProvider,");
    expect(webSource).toContain('apiFetch("/v1/catalog/type-2/considerations"');
  });

  it("invalidates a prior assessment when the selected insurer changes", () => {
    expect(webSource).toContain("setInsuranceProvider(event.target.value as InsuranceProvider); setAssessment(null);");
  });

  it("filters API ranking and insured-only presentation coverage to the selected insurer", () => {
    expect(apiSource).toContain("function rankableType2InsuranceCoverages(");
    expect(apiSource).toContain("(!selectedProvider || coverage.provider === selectedProvider)");
    expect(apiSource).toContain("request.insuranceProvider");
  });
});
