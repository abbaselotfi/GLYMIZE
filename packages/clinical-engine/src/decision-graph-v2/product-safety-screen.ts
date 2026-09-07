/**
 * Transport-only envelope for product-specific safety screening responses.
 *
 * This model deliberately has no treatment, exclusion, ranking, dose, or
 * clearance authority. A submitted response set must never be interpreted as a
 * complete or clinically valid safety screen merely because it is present.
 * Future execution requires a separately reviewed, versioned criterion registry
 * that binds each criterion to exact product identity, effect, and evidence.
 */
export type ProductSafetyResponseStateV2 = "present" | "absent" | "unknown";

export interface ProductSafetyCriterionResponseV2 {
  criterionId: string;
  state: ProductSafetyResponseStateV2;
}

export interface ProductSpecificSafetyScreenV2 {
  /** Exact Decision Graph medication identity; free-text drug names are not accepted here. */
  masterDrugId: string;
  /** Identifier of the future reviewed criterion set this response claims to answer. */
  reviewSetId: string;
  /** Exact immutable review-set version supplied with the clinician response. */
  reviewSetVersion: string;
  /** Explicit answers only. Missing criteria remain missing; `unknown` is never treated as absent. */
  responses: ProductSafetyCriterionResponseV2[];
}
