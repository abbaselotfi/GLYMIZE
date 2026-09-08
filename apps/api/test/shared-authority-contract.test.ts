import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";

import {
  activeGuidelineSources,
  getActiveClinicalRulePack,
} from "@glymize/clinical-engine";
import {
  ada2026Type2GenericSeed,
  globalReferenceCatalogue,
  globalReferenceCatalogueSources,
  type2ProtocolSeed,
} from "@glymize/catalog-data";
import { CatalogService } from "../src/catalog/catalog.service";
import { GuidelineService } from "../src/guidelines/guideline.service";

test("Nest compatibility catalogue reads immutable shared catalogue authorities", () => {
  const service = new CatalogService();

  assert.deepEqual(service.listGenerics(), ada2026Type2GenericSeed);
  assert.deepEqual(service.listType2Protocols(), type2ProtocolSeed);
  assert.deepEqual(service.listGlobalReferencePresentations(), globalReferenceCatalogue);
  assert.deepEqual(service.listGlobalReferenceSources(), globalReferenceCatalogueSources);
});

test("Nest compatibility guideline routes read the live shared guideline authority", () => {
  const service = new GuidelineService();
  const pack = getActiveClinicalRulePack();

  assert.equal(service.listSources(), activeGuidelineSources);
  assert.deepEqual(service.activeRulePack(), {
    id: pack.id,
    version: pack.version,
    status: pack.status,
    effectiveAt: pack.effectiveAt,
    approvedAt: pack.approvedAt,
    approvedBy: pack.approvedBy,
    ruleCount: pack.rules.length,
    sourceVersions: pack.sourceVersions,
  });
});
