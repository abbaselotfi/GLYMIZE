import { describe, expect, it } from "vitest";
import {
  parsePublishedCatalogState,
  parseStoredCatalogState,
} from "../lib/catalog/browser-catalog-state";
import { parseClinicianMarketDeploymentMeta } from "../lib/clinician-market-v2";

const publishedBase = {
  revision: "revision-1",
  updatedAt: "2026-09-08T00:00:00.000Z",
  updatedBy: "schema-test",
  visibility: {},
  insurance: {},
  brands: {},
  customGenerics: [],
};

describe("persisted schema version boundaries", () => {
  it("keeps legacy local catalogue drafts readable while rejecting explicit future versions", () => {
    expect(
      parseStoredCatalogState(JSON.stringify({ visibility: {}, insurance: {}, brands: {}, customGenerics: [] })),
    ).not.toBeNull();
    expect(
      parseStoredCatalogState(
        JSON.stringify({
          schemaVersion: 2,
          savedAt: "2026-09-08T00:00:00.000Z",
          state: { visibility: {}, insurance: {}, brands: {}, customGenerics: [] },
        }),
      ),
    ).not.toBeNull();
    expect(
      parseStoredCatalogState(
        JSON.stringify({ schemaVersion: 3, state: { visibility: {}, insurance: {}, brands: {}, customGenerics: [] } }),
      ),
    ).toBeNull();
  });

  it("accepts only supported published catalogue schema versions", () => {
    expect(parsePublishedCatalogState({ ...publishedBase, schemaVersion: 1 })?.schemaVersion).toBe(1);
    expect(parsePublishedCatalogState({ ...publishedBase, schemaVersion: 2 })?.schemaVersion).toBe(2);
    expect(parsePublishedCatalogState({ ...publishedBase, schemaVersion: 3 })).toBeNull();
    expect(parsePublishedCatalogState(publishedBase)).toBeNull();
  });

  it("validates clinician-market deployment metadata before using version hashes", () => {
    const sha = "a".repeat(64);
    const valid = {
      schemaVersion: 1,
      runtimeSchemaVersion: 2,
      kind: "glymize_clinician_market_deployment_meta",
      deploymentSha256: sha,
      canonicalSha256: "b".repeat(64),
    };
    expect(parseClinicianMarketDeploymentMeta(valid)?.deploymentSha256).toBe(sha);
    expect(parseClinicianMarketDeploymentMeta({ ...valid, schemaVersion: 2 })).toBeNull();
    expect(parseClinicianMarketDeploymentMeta({ ...valid, runtimeSchemaVersion: 3 })).toBeNull();
    expect(parseClinicianMarketDeploymentMeta({ ...valid, kind: "other" })).toBeNull();
    expect(parseClinicianMarketDeploymentMeta({ ...valid, deploymentSha256: "not-a-sha" })).toBeNull();
  });
});
