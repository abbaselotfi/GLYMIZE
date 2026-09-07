import {
  buildReviewedProductSafetyRegistryV2,
  validateProductSafetyScreenV2,
  type ProductSafetyScreenValidationV2,
} from "./product-safety-registry.js";
import type { ProductSpecificSafetyScreenV2 } from "./product-safety-screen.js";
import type { DecisionGraphInventoryV2 } from "./types.js";
import type { WegovyMedicationSafetyContextV2 } from "./wegovy-mash-protocol.js";

export type ReviewedWegovySafetyBindingStatusV2 =
  | "registry_unavailable"
  | "missing"
  | "identity_mismatch"
  | "version_mismatch"
  | "invalid"
  | "incomplete"
  | "bound";

export interface ReviewedWegovySafetyBindingV2 {
  status: ReviewedWegovySafetyBindingStatusV2;
  validation?: ProductSafetyScreenValidationV2;
  reviewSetId?: string;
  reviewSetVersion?: string;
  masterDrugId?: string;
  medicationSafety?: WegovyMedicationSafetyContextV2;
}

const criterionToSafetyFieldV2 = {
  "wegovy.personal_or_family_mtc_history": "personalOrFamilyHistoryMtc",
  "wegovy.men2": "men2",
  "wegovy.serious_semaglutide_hypersensitivity": "priorSeriousSemaglutideHypersensitivity",
  "wegovy.severe_gastroparesis": "severeGastroparesis",
  "wegovy.suspected_acute_pancreatitis": "suspectedAcutePancreatitis",
} as const satisfies Record<string, keyof WegovyMedicationSafetyContextV2>;

/**
 * Converts one exact, complete reviewed WEGOVY product-safety response set into
 * the boolean safety context already consumed by the reviewed WEGOVY MASH
 * protocol.
 *
 * This function is deliberately an adapter only:
 * - it does not mutate a patient request;
 * - it does not call the treatment protocol;
 * - it does not execute an exclusion, dose, rank, recommendation, or order;
 * - `bound` means only that the five response identities were validated against
 *   the exact current reviewed WEGOVY registry and can be represented without
 *   inference in the existing protocol context.
 */
export function bindReviewedWegovySafetyScreenV2(input: {
  inventory: Pick<DecisionGraphInventoryV2, "knowledge" | "marketProducts">;
  screen?: ProductSpecificSafetyScreenV2;
}): ReviewedWegovySafetyBindingV2 {
  const reviewSets = buildReviewedProductSafetyRegistryV2(input.inventory);
  if (reviewSets.length !== 1) return { status: "registry_unavailable" };

  const reviewSet = reviewSets[0]!;
  const validation = validateProductSafetyScreenV2(reviewSet, input.screen);
  const base = {
    validation,
    reviewSetId: reviewSet.reviewSetId,
    reviewSetVersion: reviewSet.reviewSetVersion,
    masterDrugId: reviewSet.masterDrugId,
  };

  if (validation.status !== "complete" || !input.screen) {
    return { status: validation.status, ...base };
  }

  const responseById = new Map(input.screen.responses.map((response) => [response.criterionId, response]));
  const medicationSafety: WegovyMedicationSafetyContextV2 = {};

  for (const criterion of reviewSet.criteria) {
    const field = criterionToSafetyFieldV2[criterion.criterionId as keyof typeof criterionToSafetyFieldV2];
    const response = responseById.get(criterion.criterionId);
    // The registry and validator make this branch unreachable for an approved
    // WEGOVY set, but keep the adapter fail-closed if the registry evolves
    // without a corresponding reviewed binding update.
    if (!field || !response || response.state === "unknown") {
      return {
        status: "incomplete",
        ...base,
        validation: {
          ...validation,
          status: "incomplete",
          missingCriterionIds: [criterion.criterionId],
        },
      };
    }
    medicationSafety[field] = response.state === "present";
  }

  return {
    status: "bound",
    ...base,
    medicationSafety,
  };
}
