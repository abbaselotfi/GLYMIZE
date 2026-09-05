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
import {
  resolveType2ParallelSafetyProjectionV2,
  type Type2ParallelSafetyProjectionV2,
  type Type2StructuredConsiderationRequestV2,
} from "./type2-intake-v2.js";
import { buildType2AssessmentWithWorldDrugCoverageV2 } from "./type2-worlddrug-recommendation-compat.js";

export interface Type2DecisionGraphRuntimeCatalog {
  masterRegistry: readonly MasterDrugRegistryEntry[];
  marketProducts: readonly IranMarketDrugProduct[];
}

export type Type2RuntimeAssessmentResultV2 = Type2AssessmentResult & {
  /** Non-ranking safety/referral channels shared by API and static-browser runtimes. */
  parallelSafety: Type2ParallelSafetyProjectionV2;
};

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

function withParallelSafety(
  assessment: Type2AssessmentResult,
  request: Type2ConsiderationRequest,
): Type2RuntimeAssessmentResultV2 {
  return {
    ...assessment,
    parallelSafety: resolveType2ParallelSafetyProjectionV2(
      request as Type2StructuredConsiderationRequestV2,
    ),
  };
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
 * The stable Type2 assessment fields remain intact. `parallelSafety` is an
 * additive, non-ranking channel resolved by the same reviewed pathway code in
 * every runtime. It never participates in medication scoring, graph rank, dose
 * execution, or scenario ordering.
 *
 * The legacy builder remains only as an explicit compatibility fallback for
 * non-browser/test consumers that have not configured runtime catalogue data.
 * Its returned medication list is passed through a structural hard-exclusion
 * firewall so legacy scores can never re-promote a contraindicated candidate.
 */
export function buildType2Assessment(
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest,
): Type2RuntimeAssessmentResultV2 {
  if (!runtimeCatalog?.masterRegistry.length) {
    const legacyAssessment = buildLegacyType2Assessment(medications, request);
    return withParallelSafety(
      filterHardExcludedLegacyType2Assessment(legacyAssessment, medications, request),
      request,
    );
  }

  return withParallelSafety(
    buildType2AssessmentWithWorldDrugCoverageV2({
      medications,
      request,
      masterRegistry: runtimeCatalog.masterRegistry,
      marketProducts: runtimeCatalog.marketProducts,
    }),
    request,
  );
}
