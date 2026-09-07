import { type2CoreInputCatalogV2 } from "./catalog-core.js";
import { type2SpecialistInputCatalogV2 } from "./catalog-specialist.js";

/**
 * Stable semantic identifiers for Type 2 clinical inputs.
 *
 * This catalogue is a drift/coverage contract only. It must never be parsed into
 * clinical execution rules, and `requestPath` is descriptive rather than a
 * dynamic object accessor. Missing/unrepresented facts remain fail-closed.
 */
export const type2ClinicalInputCatalogV2 = {
  ...type2CoreInputCatalogV2,
  ...type2SpecialistInputCatalogV2,
} as const;

export type Type2ClinicalInputIdV2 = keyof typeof type2ClinicalInputCatalogV2;

export interface Type2CapabilityInputContractV2 {
  /** Stable input identities that directly represent the capability's core minimum-safe-input concepts. */
  core: readonly Type2ClinicalInputIdV2[];
  /** Inputs needed only for a represented phenotype, product, dose, or safety branch. */
  conditional: readonly Type2ClinicalInputIdV2[];
}

export function type2ClinicalInputDefinitionV2(id: Type2ClinicalInputIdV2) {
  return type2ClinicalInputCatalogV2[id];
}
