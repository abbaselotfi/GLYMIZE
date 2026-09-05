import type {
  GenericMedication,
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
} from "@glymize/contracts";
import { buildType2Assessment as buildLegacyType2Assessment } from "./index.js";
import {
  buildType2AssessmentFromDecisionGraphV2,
  type Type2DecisionGraphAssessmentResult,
} from "./type2-decision-graph-compat.js";

export interface Type2DecisionGraphRuntimeCatalog {
  masterRegistry: readonly MasterDrugRegistryEntry[];
  marketProducts: readonly IranMarketDrugProduct[];
}

let runtimeCatalog: Type2DecisionGraphRuntimeCatalog | undefined;

export function configureType2DecisionGraphRuntimeCatalog(catalog: Type2DecisionGraphRuntimeCatalog) {
  runtimeCatalog = {
    masterRegistry: [...catalog.masterRegistry],
    marketProducts: [...catalog.marketProducts],
  };
}

export function clearType2DecisionGraphRuntimeCatalogForTests() {
  runtimeCatalog = undefined;
}

export function type2DecisionGraphRuntimeConfigured() {
  return Boolean(runtimeCatalog?.masterRegistry.length);
}

/**
 * Live Type 2 authority entrypoint.
 *
 * Browser runtime configures the approved WorldDrug master registry plus the
 * current Iran market snapshot before the first consideration request. The
 * legacy builder remains only as an explicit compatibility fallback for
 * non-browser/test consumers that have not configured runtime catalogue data.
 */
export function buildType2Assessment(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest,
): Type2AssessmentResult | Type2DecisionGraphAssessmentResult {
  if (!runtimeCatalog?.masterRegistry.length) {
    return buildLegacyType2Assessment(medications, request);
  }

  return buildType2AssessmentFromDecisionGraphV2({
    medications,
    request,
    masterRegistry: runtimeCatalog.masterRegistry,
    marketProducts: runtimeCatalog.marketProducts,
  });
}
