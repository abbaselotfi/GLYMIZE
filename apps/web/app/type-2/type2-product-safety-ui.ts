import type { listType2ReviewedProductSafetyReviewSetsV2 } from "@glymize/clinical-engine";
import type { Type2StructuredClinicalContextV2 } from "@glymize/clinical-engine/type2-intake-v2";

export type Type2ReviewedProductSafetyReviewSetV2 =
  ReturnType<typeof listType2ReviewedProductSafetyReviewSetsV2>[number];

export type Type2ProductSafetyScreenV2 =
  NonNullable<Type2StructuredClinicalContextV2["productSafetyScreens"]>[number];

export type Type2ProductSafetyResponseStateV2 =
  Type2ProductSafetyScreenV2["responses"][number]["state"];

function exactReviewSetIdentity(
  screen: Type2ProductSafetyScreenV2,
  reviewSet: Type2ReviewedProductSafetyReviewSetV2,
) {
  return screen.masterDrugId === reviewSet.masterDrugId &&
    screen.reviewSetId === reviewSet.reviewSetId &&
    screen.reviewSetVersion === reviewSet.reviewSetVersion;
}

export function type2ProductSafetyResponseStateV2(
  screens: readonly Type2ProductSafetyScreenV2[],
  reviewSet: Type2ReviewedProductSafetyReviewSetV2,
  criterionId: string,
): Type2ProductSafetyResponseStateV2 | undefined {
  return screens
    .find((screen) => exactReviewSetIdentity(screen, reviewSet))
    ?.responses.find((response) => response.criterionId === criterionId)
    ?.state;
}

/**
 * Updates only one exact reviewed product-safety response envelope.
 *
 * Safety invariants:
 * - an unanswered field removes the response instead of inventing `unknown`;
 * - a stale version/master-drug claim for the same review-set id is discarded
 *   when the clinician edits the current review set and is never migrated;
 * - only criterion ids present in the current authoritative metadata survive;
 * - an envelope with zero explicit responses is omitted entirely.
 */
export function updateType2ProductSafetyScreensV2(
  screens: readonly Type2ProductSafetyScreenV2[],
  reviewSet: Type2ReviewedProductSafetyReviewSetV2,
  criterionId: string,
  state: Type2ProductSafetyResponseStateV2 | undefined,
): Type2ProductSafetyScreenV2[] {
  const allowedCriterionIds = new Set(reviewSet.criteria.map((criterion) => criterion.criterionId));
  const exact = screens.find((screen) => exactReviewSetIdentity(screen, reviewSet));
  const responses = (exact?.responses ?? [])
    .filter((response) => allowedCriterionIds.has(response.criterionId))
    .filter((response) => response.criterionId !== criterionId);

  if (state && allowedCriterionIds.has(criterionId)) {
    responses.push({ criterionId, state });
  }

  const unrelated = screens.filter((screen) => screen.reviewSetId !== reviewSet.reviewSetId);
  if (!responses.length) return unrelated.map((screen) => structuredClone(screen));

  return [
    ...unrelated.map((screen) => structuredClone(screen)),
    {
      masterDrugId: reviewSet.masterDrugId,
      reviewSetId: reviewSet.reviewSetId,
      reviewSetVersion: reviewSet.reviewSetVersion,
      responses,
    },
  ];
}
