import type {
  GenericMedication,
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
} from "@glymize/contracts";
import { buildType2Assessment as buildLegacyType2Assessment } from "./index.js";
import {
  filterHardExcludedLegacyType2Assessment,
} from "./type2-hard-exclusion-compat.js";
import { buildType2AssessmentWithWorldDrugCoverageV2 } from "./type2-worlddrug-recommendation-compat.js";

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
 * current Iran market snapshot before the first consideration request. Decision
 * Graph v2 remains the only executable/ranking authority. The WorldDrug coverage
 * projection may append current-market, patient-context-relevant medicines as
 * `requires_approved_protocol` review options; those options receive no Decision
 * Graph rank and cannot become executable until a reviewed rule/protocol exists.
 *
 * The public function deliberately retains the stable `Type2AssessmentResult`
 * contract. Additional WorldDrug coverage metadata is an internal compatible
 * extension and must not leak package-private declaration paths into API types.
 *
 * The legacy builder remains only as an explicit compatibility fallback for
 * non-browser/test consumers that have not configured runtime catalogue data.
 * Its returned medication list is passed through a structural hard-exclusion
 * firewall so legacy scores can never re-promote a contraindicated candidate.
 */
export function buildType2Assessment(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest,
): Type2AssessmentResult {
  if (!runtimeCatalog?.masterRegistry.length) {
    const legacyAssessment = buildLegacyType2Assessment(medications, request);
    return filterHardExcludedLegacyType2Assessment(legacyAssessment, medications, request);
  }

  return buildType2AssessmentWithWorldDrugCoverageV2({
    medications,
    request,
    masterRegistry: runtimeCatalog.masterRegistry,
    marketProducts: runtimeCatalog.marketProducts,
  });
}
