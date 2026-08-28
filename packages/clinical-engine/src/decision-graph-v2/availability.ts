import type {
  IranAvailabilityAssessmentV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
} from "./types.js";

export function productsForMedicationV2(
  medication: KnowledgeMedicationV2,
  products: readonly IranMarketProductV2[],
) {
  return products.filter((product) => product.masterDrugId === medication.masterDrugId);
}

export function assessIranAvailabilityV2(
  medication: KnowledgeMedicationV2,
  products: readonly IranMarketProductV2[],
): IranAvailabilityAssessmentV2 {
  const matched = productsForMedicationV2(medication, products);
  const verified = matched.filter((product) => product.nfiMatchState === "verified");
  const unverifiedOnly = matched.length > 0 && verified.length === 0;

  if (unverifiedOnly) {
    return {
      masterDrugId: medication.masterDrugId,
      classification: "excluded_unverified_match",
      mainRecommendationEligible: false,
      moreOptionsEligible: false,
      currentProductIds: [],
      historicalProductIds: [],
      reasons: ["تطبیق WorldDrug ↔ NFI هنوز verified نشده است."],
    };
  }

  const current = verified.filter((product) =>
    product.license.everValid &&
    product.license.currentValid &&
    !product.license.revoked &&
    (product.marketPresence === "confirmed_active" || product.marketPresence === "recently_observed"),
  );
  if (current.length) {
    return {
      masterDrugId: medication.masterDrugId,
      classification: "current_market",
      mainRecommendationEligible: true,
      moreOptionsEligible: true,
      currentProductIds: current.map((product) => product.productId),
      historicalProductIds: [],
      reasons: ["پروانه معتبر NFI و حضور جاری/اخیر بازار برای حداقل یک فرآورده تأیید شده است."],
    };
  }

  const revoked = verified.filter((product) => product.license.revoked);
  if (revoked.length) {
    return {
      masterDrugId: medication.masterDrugId,
      classification: "excluded_revoked",
      mainRecommendationEligible: false,
      moreOptionsEligible: false,
      currentProductIds: [],
      historicalProductIds: revoked.map((product) => product.productId),
      reasons: ["حداقل رکورد verified وجود دارد اما وضعیت پروانه revoked است."],
    };
  }

  const licensedButMarketUnknown = verified.filter((product) =>
    product.license.everValid &&
    product.license.currentValid &&
    !product.license.revoked &&
    product.marketPresence === "unknown",
  );
  if (licensedButMarketUnknown.length) {
    return {
      masterDrugId: medication.masterDrugId,
      classification: "current_license_market_unconfirmed",
      mainRecommendationEligible: false,
      moreOptionsEligible: true,
      currentProductIds: licensedButMarketUnknown.map((product) => product.productId),
      historicalProductIds: [],
      reasons: ["پروانه فعلی معتبر است اما حضور بازار برای Top Recommendation تأیید نشده است."],
    };
  }

  const historical = verified.filter((product) => product.license.everValid && !product.license.revoked);
  if (historical.length) {
    return {
      masterDrugId: medication.masterDrugId,
      classification: "historical_only",
      mainRecommendationEligible: false,
      moreOptionsEligible: true,
      currentProductIds: [],
      historicalProductIds: historical.map((product) => product.productId),
      reasons: ["دارو سابقه پروانه معتبر دارد اما فرآورده جاری قابل اتکا برای بازار فعلی تأیید نشده است؛ فقط در انتهای More Options مجاز است."],
    };
  }

  if (verified.some((product) => product.marketPresence === "unavailable")) {
    return {
      masterDrugId: medication.masterDrugId,
      classification: "excluded_unavailable",
      mainRecommendationEligible: false,
      moreOptionsEligible: false,
      currentProductIds: [],
      historicalProductIds: [],
      reasons: ["فرآورده verified است اما بازار آن unavailable ثبت شده است."],
    };
  }

  return {
    masterDrugId: medication.masterDrugId,
    classification: "excluded_never_licensed",
    mainRecommendationEligible: false,
    moreOptionsEligible: false,
    currentProductIds: [],
    historicalProductIds: [],
    reasons: ["هیچ سابقه verified از پروانه معتبر NFI برای این WorldDrug entry وجود ندارد."],
  };
}
