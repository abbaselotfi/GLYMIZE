import type {
  DecisionGraphInventoryV2,
  EvidenceReferenceV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
} from "./types.js";
import type { ProductSpecificSafetyScreenV2 } from "./product-safety-screen.js";
import { wegovy2026LabelEvidenceV2 } from "./wegovy-mash-protocol.js";

export type ProductSafetyCriterionEffectV2 =
  | "exclude_if_present"
  | "block_execution_if_present";

export interface ReviewedProductSafetyCriterionV2 {
  criterionId: string;
  label: string;
  presentMeaning: string;
  effect: ProductSafetyCriterionEffectV2;
  evidence: EvidenceReferenceV2[];
}

export interface ReviewedProductSafetyReviewSetV2 {
  reviewSetId: string;
  reviewSetVersion: string;
  masterDrugId: string;
  productIdentity: {
    brandName: string;
    route: string;
  };
  criteria: ReviewedProductSafetyCriterionV2[];
  reviewState: "approved";
  evidence: EvidenceReferenceV2[];
}

export type ProductSafetyScreenValidationStatusV2 =
  | "missing"
  | "identity_mismatch"
  | "version_mismatch"
  | "invalid"
  | "incomplete"
  | "complete";

export interface ProductSafetyScreenValidationV2 {
  status: ProductSafetyScreenValidationStatusV2;
  missingCriterionIds: string[];
  unknownCriterionIds: string[];
  duplicateCriterionIds: string[];
  riskCriterionIds: string[];
}

const WEGOVY_MASH_REVIEW_SET_ID = "WEGOVY-MASH-SAFETY";
const WEGOVY_MASH_REVIEW_SET_VERSION = "2026-06-18";

function normalized(value: string | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isInjectableSemaglutide(medication: KnowledgeMedicationV2) {
  return normalized(medication.genericName).startsWith("semaglutide") &&
    medication.routeOptions.some((route) => normalized(route).includes("subcutaneous"));
}

function isCurrentVerifiedWegovyProduct(product: IranMarketProductV2, masterDrugId: string) {
  return product.masterDrugId === masterDrugId &&
    normalized(product.brandName) === "wegovy" &&
    normalized(product.route).includes("subcutaneous") &&
    product.nfiMatchState === "verified" &&
    product.license.currentValid &&
    !product.license.revoked &&
    (product.marketPresence === "confirmed_active" || product.marketPresence === "recently_observed");
}

function wegovyCriterion(
  criterionId: string,
  label: string,
  presentMeaning: string,
  effect: ProductSafetyCriterionEffectV2,
): ReviewedProductSafetyCriterionV2 {
  return {
    criterionId,
    label,
    presentMeaning,
    effect,
    evidence: [wegovy2026LabelEvidenceV2],
  };
}

/**
 * Reviewed registry for safety facts already required by the executable WEGOVY
 * MASH protocol. This registry does not add a new contraindication, warning, or
 * interaction. It only makes the existing reviewed label requirements stable,
 * versioned and machine-readable for the transport envelope introduced earlier.
 *
 * Exact product identity remains mandatory: generic semaglutide, Ozempic, or an
 * unverified/non-current product cannot inherit this WEGOVY review set.
 */
export function buildReviewedProductSafetyRegistryV2(
  inventory: Pick<DecisionGraphInventoryV2, "knowledge" | "marketProducts">,
): ReviewedProductSafetyReviewSetV2[] {
  const medication = inventory.knowledge.find((item) =>
    item.engineState === "approved" && isInjectableSemaglutide(item));
  if (!medication) return [];

  const hasCurrentVerifiedWegovy = inventory.marketProducts.some((product) =>
    isCurrentVerifiedWegovyProduct(product, medication.masterDrugId));
  if (!hasCurrentVerifiedWegovy) return [];

  return [{
    reviewSetId: WEGOVY_MASH_REVIEW_SET_ID,
    reviewSetVersion: WEGOVY_MASH_REVIEW_SET_VERSION,
    masterDrugId: medication.masterDrugId,
    productIdentity: {
      brandName: "WEGOVY",
      route: "subcutaneous",
    },
    criteria: [
      wegovyCriterion(
        "wegovy.personal_or_family_mtc_history",
        "Personal or family history of medullary thyroid carcinoma (MTC)",
        "A present response represents the WEGOVY label contraindication for personal or family history of MTC.",
        "exclude_if_present",
      ),
      wegovyCriterion(
        "wegovy.men2",
        "Multiple Endocrine Neoplasia syndrome type 2 (MEN 2)",
        "A present response represents the WEGOVY label contraindication for MEN 2.",
        "exclude_if_present",
      ),
      wegovyCriterion(
        "wegovy.serious_semaglutide_hypersensitivity",
        "Prior serious hypersensitivity reaction to semaglutide or WEGOVY excipients",
        "A present response represents the WEGOVY label contraindication for prior serious hypersensitivity.",
        "exclude_if_present",
      ),
      wegovyCriterion(
        "wegovy.severe_gastroparesis",
        "Severe gastroparesis",
        "A present response means the reviewed WEGOVY MASH execution path must remain blocked because WEGOVY is not recommended in severe gastroparesis.",
        "block_execution_if_present",
      ),
      wegovyCriterion(
        "wegovy.suspected_acute_pancreatitis",
        "Suspected acute pancreatitis",
        "A present response means WEGOVY execution must remain blocked and the pancreatitis warning requires clinical management rather than treatment execution.",
        "block_execution_if_present",
      ),
    ],
    reviewState: "approved",
    evidence: [wegovy2026LabelEvidenceV2],
  }];
}

/**
 * Validates only transport integrity and completeness against one exact reviewed
 * set. `complete` means every criterion in this immutable review set has one
 * explicit non-unknown response; it is not a global declaration that the product
 * is safe and it does not itself execute an exclusion, ranking, dose, or order.
 */
export function validateProductSafetyScreenV2(
  reviewSet: ReviewedProductSafetyReviewSetV2,
  screen: ProductSpecificSafetyScreenV2 | undefined,
): ProductSafetyScreenValidationV2 {
  if (!screen) {
    return {
      status: "missing",
      missingCriterionIds: reviewSet.criteria.map((item) => item.criterionId),
      unknownCriterionIds: [],
      duplicateCriterionIds: [],
      riskCriterionIds: [],
    };
  }

  if (screen.masterDrugId !== reviewSet.masterDrugId || screen.reviewSetId !== reviewSet.reviewSetId) {
    return {
      status: "identity_mismatch",
      missingCriterionIds: reviewSet.criteria.map((item) => item.criterionId),
      unknownCriterionIds: [],
      duplicateCriterionIds: [],
      riskCriterionIds: [],
    };
  }

  if (screen.reviewSetVersion !== reviewSet.reviewSetVersion) {
    return {
      status: "version_mismatch",
      missingCriterionIds: reviewSet.criteria.map((item) => item.criterionId),
      unknownCriterionIds: [],
      duplicateCriterionIds: [],
      riskCriterionIds: [],
    };
  }

  const counts = new Map<string, number>();
  for (const response of screen.responses) {
    counts.set(response.criterionId, (counts.get(response.criterionId) ?? 0) + 1);
  }
  const duplicateCriterionIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([criterionId]) => criterionId)
    .sort();

  const allowed = new Set(reviewSet.criteria.map((item) => item.criterionId));
  const unknownCriterionIds = [...counts.keys()]
    .filter((criterionId) => !allowed.has(criterionId))
    .sort();

  if (duplicateCriterionIds.length || unknownCriterionIds.length) {
    return {
      status: "invalid",
      missingCriterionIds: [],
      unknownCriterionIds,
      duplicateCriterionIds,
      riskCriterionIds: [],
    };
  }

  const responseById = new Map(screen.responses.map((response) => [response.criterionId, response]));
  const missingCriterionIds = reviewSet.criteria
    .filter((criterion) => !responseById.has(criterion.criterionId))
    .map((criterion) => criterion.criterionId);
  const unresolvedCriterionIds = reviewSet.criteria
    .filter((criterion) => responseById.get(criterion.criterionId)?.state === "unknown")
    .map((criterion) => criterion.criterionId);
  const riskCriterionIds = reviewSet.criteria
    .filter((criterion) => responseById.get(criterion.criterionId)?.state === "present")
    .map((criterion) => criterion.criterionId);

  const incomplete = [...new Set([...missingCriterionIds, ...unresolvedCriterionIds])];
  return {
    status: incomplete.length ? "incomplete" : "complete",
    missingCriterionIds: incomplete,
    unknownCriterionIds: [],
    duplicateCriterionIds: [],
    riskCriterionIds,
  };
}
