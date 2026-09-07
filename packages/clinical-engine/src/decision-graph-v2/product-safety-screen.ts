/**
 * Transport-only envelope for product-specific safety screening responses.
 *
 * This model deliberately has no treatment, exclusion, ranking, dose, or
 * clearance authority. A submitted response set must never be interpreted as a
 * complete or clinically valid safety screen merely because it is present.
 * Completeness can be evaluated only against an exact separately reviewed,
 * versioned criterion registry bound to product identity, effect, and evidence;
 * even a complete response set does not itself grant treatment execution.
 */
export type ProductSafetyResponseStateV2 = "present" | "absent" | "unknown";

export interface ProductSafetyCriterionResponseV2 {
  criterionId: string;
  state: ProductSafetyResponseStateV2;
}

export interface ProductSpecificSafetyScreenV2 {
  /** Exact Decision Graph medication identity; free-text drug names are not accepted here. */
  masterDrugId: string;
  /** Identifier of the reviewed criterion set this response claims to answer. */
  reviewSetId: string;
  /** Exact immutable review-set version supplied with the clinician response. */
  reviewSetVersion: string;
  /** Explicit answers only. Missing criteria remain missing; `unknown` is never treated as absent. */
  responses: ProductSafetyCriterionResponseV2[];
}
