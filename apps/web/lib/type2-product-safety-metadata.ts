import { listType2ReviewedProductSafetyReviewSetsV2 } from "@glymize/clinical-engine";
import { apiFetch } from "./api-client";

/**
 * Ensures the browser-owned catalogue has configured the live Decision Graph
 * runtime before reading reviewed product-safety collection metadata. The
 * returned review sets therefore use the same WorldDrug/NFI identities as the
 * Type 2 assessment path; this loader never fabricates fallback review sets.
 */
export async function loadType2ReviewedProductSafetyReviewSetsV2() {
  const catalogue = await apiFetch("/v1/catalog/generics");
  if (!catalogue.ok) return [];
  return listType2ReviewedProductSafetyReviewSetsV2();
}
