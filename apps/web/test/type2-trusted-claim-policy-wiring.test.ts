import fs from "node:fs";
import { describe, expect, it } from "vitest";

const loader = fs.readFileSync(
  new URL("../lib/type2-claim-policy-runtime.ts", import.meta.url),
  "utf8",
);
const market = fs.readFileSync(
  new URL("../lib/type2-decision-graph-market.ts", import.meta.url),
  "utf8",
);

describe("Type-2 trusted claim-policy wiring", () => {
  it("uses the authenticated runtime and fails closed on unavailable policy", () => {
    expect(loader).toContain('runtimeFetch(');
    expect(loader).toContain('/v1/clinical/type2/insurance-claim-policies');
    expect(loader).toContain('configureType2DecisionGraphRuntimeInsurancePolicies([], 0)');
    expect(loader).toContain('payload.authority !== "trusted_runtime"');
  });

  it("starts trusted policy refresh before loading the Decision Graph market snapshot", () => {
    const initialize = market.indexOf("await initializeTrustedType2ClaimPolicyRuntime();");
    const cache = market.indexOf("if (cache) return cache;");
    expect(initialize).toBeGreaterThan(-1);
    expect(cache).toBeGreaterThan(initialize);
  });
});
