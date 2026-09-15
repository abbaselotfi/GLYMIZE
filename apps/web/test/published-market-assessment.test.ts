import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { ada2026Type2GenericSeed } from "@glymize/catalog-data";
import { buildType2Assessment, configureType2DecisionGraphRuntimeCatalog, clearType2DecisionGraphRuntimeCatalogForTests } from "@glymize/clinical-engine";
import { projectType2DecisionGraphMarket } from "../lib/type2-decision-graph-market";

afterEach(() => clearType2DecisionGraphRuntimeCatalogForTests());

it("assesses the published market through the real Type 2 runtime", () => {
  const market = JSON.parse(readFileSync(new URL("../public/data/glymize-clinician-market-v2.json", import.meta.url), "utf8"));
  const catalog = JSON.parse(readFileSync(new URL("../public/data/admin-catalog.json", import.meta.url), "utf8"));
  const products = projectType2DecisionGraphMarket(market).products;
  expect(products.length).toBeGreaterThan(0);
  expect(catalog.masterRegistry.length).toBeGreaterThan(0);
  configureType2DecisionGraphRuntimeCatalog({ masterRegistry: catalog.masterRegistry, marketProducts: products });
  const result = buildType2Assessment(ada2026Type2GenericSeed, {
    currentHba1c: 8.7, targetHba1c: 7, currentMedications: [], factors: [],
  });
  expect(result.recommendation.hba1cGap).toBeCloseTo(1.7);
  expect(result.recommendation.sourceReference).toContain("GLYMIZE_DECISION_GRAPH_V2_AUTHORITY");
// Full published fixtures are an integration correctness check, not a portable
// CPU benchmark. Allow measured cold-run variance, as in the browser integration.
}, 15_000);
