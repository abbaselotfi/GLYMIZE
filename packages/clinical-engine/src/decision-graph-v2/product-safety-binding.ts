import {
  buildReviewedProductSafetyRegistryV2,
  validateProductSafetyScreenV2,
  type ProductSafetyScreenValidationV2,
} from "./product-safety-registry.js";
import type { ProductSpecificSafetyScreenV2 } from "./product-safety-screen.js";
import type {
  DecisionGraphInventoryV2,
  MedicationSafetyContextV2,
  PatientContextV2,
} from "./types.js";
import type { WegovyMedicationSafetyContextV2 } from "./wegovy-mash-protocol.js";

export type ReviewedWegovySafetyBindingStatusV2 =
  | "registry_unavailable"
  | "missing"
  | "identity_mismatch"
  | "version_mismatch"
  | "invalid"
  | "incomplete"
  | "duplicate_screen"
  | "bound";

export interface ReviewedWegovySafetyBindingV2 {
  status: ReviewedWegovySafetyBindingStatusV2;
  validation?: ProductSafetyScreenValidationV2;
  reviewSetId?: string;
  reviewSetVersion?: string;
  masterDrugId?: string;
  medicationSafety?: WegovyMedicationSafetyContextV2;
}

export type ProductSafetyScreenedPatientV2 = PatientContextV2 & {
  productSafetyScreens?: readonly ProductSpecificSafetyScreenV2[];
};

export interface ReviewedWegovySafetyProjectionV2 {
  binding: ReviewedWegovySafetyBindingV2;
  patient: PatientContextV2;
}

const criterionToSafetyFieldV2 = {
  "wegovy.personal_or_family_mtc_history": "personalOrFamilyHistoryMtc",
  "wegovy.men2": "men2",
  "wegovy.serious_semaglutide_hypersensitivity": "priorSeriousSemaglutideHypersensitivity",
  "wegovy.severe_gastroparesis": "severeGastroparesis",
  "wegovy.suspected_acute_pancreatitis": "suspectedAcutePancreatitis",
} as const satisfies Record<string, keyof WegovyMedicationSafetyContextV2>;

type ReviewedWegovyCriterionIdV2 = keyof typeof criterionToSafetyFieldV2;
const reviewedWegovyCriterionIdsV2 = Object.keys(criterionToSafetyFieldV2) as ReviewedWegovyCriterionIdV2[];

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

  if (validation.status !== "complete") {
    return { status: validation.status, ...base };
  }

  // `complete` cannot be produced without a submitted screen, but keep this
  // explicit guard so transport assumptions never become an unsafe assertion.
  if (!input.screen) {
    return {
      status: "missing",
      ...base,
      validation: {
        ...validation,
        status: "missing",
        missingCriterionIds: [...reviewedWegovyCriterionIdsV2],
      },
    };
  }

  const registryCriterionIds = reviewSet.criteria.map((criterion) => criterion.criterionId);
  const registryMatchesReviewedBinding =
    registryCriterionIds.length === reviewedWegovyCriterionIdsV2.length &&
    reviewedWegovyCriterionIdsV2.every((criterionId) => registryCriterionIds.includes(criterionId));

  // If the reviewed registry changes, the binding must be reviewed and updated
  // separately. Never silently drop a newly introduced safety criterion or
  // invent a boolean for one that no longer exists.
  if (!registryMatchesReviewedBinding) {
    const unboundCriterionIds = [
      ...registryCriterionIds.filter((criterionId) => !(criterionId in criterionToSafetyFieldV2)),
      ...reviewedWegovyCriterionIdsV2.filter((criterionId) => !registryCriterionIds.includes(criterionId)),
    ];
    return {
      status: "incomplete",
      ...base,
      validation: {
        ...validation,
        status: "incomplete",
        missingCriterionIds: [...new Set(unboundCriterionIds)],
      },
    };
  }

  const responseById = new Map(input.screen.responses.map((response) => [response.criterionId, response]));
  const isPresent = (criterionId: ReviewedWegovyCriterionIdV2) => {
    const response = responseById.get(criterionId);
    if (!response || response.state === "unknown") return undefined;
    return response.state === "present";
  };

  const personalOrFamilyHistoryMtc = isPresent("wegovy.personal_or_family_mtc_history");
  const men2 = isPresent("wegovy.men2");
  const priorSeriousSemaglutideHypersensitivity = isPresent("wegovy.serious_semaglutide_hypersensitivity");
  const severeGastroparesis = isPresent("wegovy.severe_gastroparesis");
  const suspectedAcutePancreatitis = isPresent("wegovy.suspected_acute_pancreatitis");

  if (
    personalOrFamilyHistoryMtc === undefined ||
    men2 === undefined ||
    priorSeriousSemaglutideHypersensitivity === undefined ||
    severeGastroparesis === undefined ||
    suspectedAcutePancreatitis === undefined
  ) {
    return {
      status: "incomplete",
      ...base,
      validation: {
        ...validation,
        status: "incomplete",
        missingCriterionIds: reviewedWegovyCriterionIdsV2.filter((criterionId) => isPresent(criterionId) === undefined),
      },
    };
  }

  const medicationSafety: WegovyMedicationSafetyContextV2 = {
    personalOrFamilyHistoryMtc,
    men2,
    priorSeriousSemaglutideHypersensitivity,
    severeGastroparesis,
    suspectedAcutePancreatitis,
  };

  return {
    status: "bound",
    ...base,
    medicationSafety,
  };
}

/**
 * Selects the exact WEGOVY review set from a collection of product-safety
 * envelopes. Unrelated product/review sets are ignored, but two envelopes that
 * both claim the exact current WEGOVY review-set identity are ambiguous and are
 * rejected rather than choosing one by array order.
 */
export function bindReviewedWegovySafetyScreensV2(input: {
  inventory: Pick<DecisionGraphInventoryV2, "knowledge" | "marketProducts">;
  screens?: readonly ProductSpecificSafetyScreenV2[];
}): ReviewedWegovySafetyBindingV2 {
  const reviewSets = buildReviewedProductSafetyRegistryV2(input.inventory);
  if (reviewSets.length !== 1) return { status: "registry_unavailable" };

  const reviewSet = reviewSets[0]!;
  const candidates = (input.screens ?? []).filter((screen) => screen.reviewSetId === reviewSet.reviewSetId);
  const exact = candidates.filter((screen) => screen.masterDrugId === reviewSet.masterDrugId);
  const base = {
    reviewSetId: reviewSet.reviewSetId,
    reviewSetVersion: reviewSet.reviewSetVersion,
    masterDrugId: reviewSet.masterDrugId,
  };

  if (exact.length > 1) return { status: "duplicate_screen", ...base };
  if (exact.length === 1) {
    return bindReviewedWegovySafetyScreenV2({ inventory: input.inventory, screen: exact[0] });
  }

  // A lone envelope claiming this exact review-set ID for another MasterDrug is
  // an identity mismatch, not an acceptable substitute or an unrelated screen.
  if (candidates.length === 1) {
    return bindReviewedWegovySafetyScreenV2({ inventory: input.inventory, screen: candidates[0] });
  }
  if (candidates.length > 1) return { status: "duplicate_screen", ...base };

  return bindReviewedWegovySafetyScreenV2({ inventory: input.inventory });
}

function preserveGeneralMedicationSafetyV2(
  safety: PatientContextV2["medicationSafety"],
): MedicationSafetyContextV2 | undefined {
  if (!safety) return undefined;
  const preserved: MedicationSafetyContextV2 = {
    maoiUseOrRecentExposure: safety.maoiUseOrRecentExposure,
    substantialAlcoholUse: safety.substantialAlcoholUse,
    knownPregabalinHypersensitivity: safety.knownPregabalinHypersensitivity,
  };
  return Object.values(preserved).some((value) => value !== undefined) ? preserved : undefined;
}

/**
 * Projects reviewed product-safety transport data into the normalized core
 * patient context without mutating the submitted patient object.
 *
 * Only the three general medication-safety fields already defined by
 * `PatientContextV2` are carried forward directly. WEGOVY-specific booleans are
 * reconstructed exclusively from an exact `bound` review set, so ad-hoc extra
 * properties on `medicationSafety` cannot bypass the versioned registry on the
 * structured Type 2 execution path.
 */
export function projectReviewedWegovySafetyForDecisionGraphV2(input: {
  inventory: Pick<DecisionGraphInventoryV2, "knowledge" | "marketProducts">;
  patient: ProductSafetyScreenedPatientV2;
}): ReviewedWegovySafetyProjectionV2 {
  const binding = bindReviewedWegovySafetyScreensV2({
    inventory: input.inventory,
    screens: input.patient.productSafetyScreens,
  });
  const { productSafetyScreens: _screens, medicationSafety: submittedSafety, ...patient } = input.patient;
  const generalSafety = preserveGeneralMedicationSafetyV2(submittedSafety);
  const projectedSafety = binding.status === "bound"
    ? ({ ...generalSafety, ...binding.medicationSafety } satisfies MedicationSafetyContextV2 & WegovyMedicationSafetyContextV2)
    : generalSafety;

  return {
    binding,
    patient: {
      ...patient,
      ...(projectedSafety ? { medicationSafety: projectedSafety } : {}),
    },
  };
}
