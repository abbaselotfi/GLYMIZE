export interface DrugMarketV2PreflightMetrics {
  productCount: number;
  nfiVerifiedCount: number;
  insuranceRecordCount: number;
  reviewQueueCount: number;
  duplicateProductIdCount: number;
  duplicateNfiDetailIdCount: number;
  mergedGenericWithoutComponentsCount: number;
  multipleNfiCodesFlagCount: number;
  genericCodeIdentityCollisionCount: number;
  suspiciousSearchScopeCount: number;
  packageConfidenceConflictCount: number;
  ambiguousInsuranceCount: number;
  unmatchedInsuranceCount: number;
  unknownInsuranceSemanticCount: number;
}

export interface DrugMarketV2PreflightResult {
  schemaVersion: 2 | null;
  acceptedForStaging: boolean;
  blockers: string[];
  warnings: string[];
  metrics: DrugMarketV2PreflightMetrics;
}

type UnknownRecord = Record<string, unknown>;

function objectValue(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function preflightDrugMarketV2(value: unknown): DrugMarketV2PreflightResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const root = objectValue(value);
  const products = arrayValue(root?.products);
  const insuranceRecords = arrayValue(root?.insuranceRecords);
  const reviewQueue = arrayValue(root?.reviewQueue);
  const nfiSearchResults = arrayValue(root?.nfiSearchResults);
  const sourceRuns = arrayValue(root?.sourceRuns);

  const metrics: DrugMarketV2PreflightMetrics = {
    productCount: products.length,
    nfiVerifiedCount: 0,
    insuranceRecordCount: insuranceRecords.length,
    reviewQueueCount: reviewQueue.length,
    duplicateProductIdCount: 0,
    duplicateNfiDetailIdCount: 0,
    mergedGenericWithoutComponentsCount: 0,
    multipleNfiCodesFlagCount: 0,
    genericCodeIdentityCollisionCount: 0,
    suspiciousSearchScopeCount: 0,
    packageConfidenceConflictCount: 0,
    ambiguousInsuranceCount: 0,
    unmatchedInsuranceCount: 0,
    unknownInsuranceSemanticCount: 0,
  };

  if (!root || root.schemaVersion !== 2) {
    blockers.push("فایل canonical باید schemaVersion=2 داشته باشد.");
  }
  if (!products.length) blockers.push("هیچ Product در canonical وجود ندارد.");

  const requiredSources = new Set(["iran_fda_nfi", "health_insurance", "armed_forces", "social_security"]);
  for (const source of sourceRuns) {
    const item = objectValue(source);
    const id = textValue(item?.sourceId);
    if (id) requiredSources.delete(id);
    if (id && item?.status !== "succeeded") blockers.push(`Source ${id} کامل نشده است.`);
    if (id && item?.stale === true) blockers.push(`Source ${id} stale است.`);
  }
  for (const id of requiredSources) blockers.push(`Source run لازم وجود ندارد: ${id}`);

  const productIds = new Set<string>();
  const detailIds = new Set<string>();
  const genericCodeNames = new Map<string, Set<string>>();

  for (const rawProduct of products) {
    const item = objectValue(rawProduct);
    const generic = objectValue(item?.generic);
    const product = objectValue(item?.product);
    const market = objectValue(item?.market);
    const flags = arrayValue(item?.qualityFlags).map(textValue);
    const productId = textValue(item?.productId);
    const detailId = textValue(product?.nfiDetailId);
    const canonicalName = textValue(generic?.canonicalName);
    const nameEn = textValue(generic?.nameEn);
    const genericCode = textValue(generic?.genericRegistryCode);
    const components = arrayValue(product?.components);

    if (market?.nfiVerificationStatus === "nfi_verified") metrics.nfiVerifiedCount += 1;

    if (productId) {
      if (productIds.has(productId)) metrics.duplicateProductIdCount += 1;
      productIds.add(productId);
    }
    if (detailId) {
      if (detailIds.has(detailId)) metrics.duplicateNfiDetailIdCount += 1;
      detailIds.add(detailId);
    }

    if (genericCode && canonicalName) {
      const names = genericCodeNames.get(genericCode) ?? new Set<string>();
      names.add(canonicalName);
      genericCodeNames.set(genericCode, names);
    }

    if (nameEn.includes(";") && components.length === 0) {
      metrics.mergedGenericWithoutComponentsCount += 1;
    }
    if (flags.includes("MULTIPLE_NFI_CODES_FOR_ONE_PRESENTATION")) {
      metrics.multipleNfiCodesFlagCount += 1;
    }
    const confidence = numberValue(product?.packageParserConfidence);
    if (flags.includes("PACKAGE_UNRESOLVED") && confidence !== undefined && confidence >= 0.8) {
      metrics.packageConfidenceConflictCount += 1;
    }
  }

  metrics.genericCodeIdentityCollisionCount = [...genericCodeNames.values()].filter((names) => names.size > 1).length;

  for (const rawSearch of nfiSearchResults) {
    const search = objectValue(rawSearch);
    const resultCount = numberValue(search?.resultCount) ?? 0;
    const activeResultCount = numberValue(search?.activeResultCount) ?? 0;
    if (resultCount > 1500 || activeResultCount > 1200) metrics.suspiciousSearchScopeCount += 1;
  }

  for (const rawInsurance of insuranceRecords) {
    const record = objectValue(rawInsurance);
    const match = objectValue(record?.match);
    if (match?.status === "ambiguous") metrics.ambiguousInsuranceCount += 1;
    if (match?.status === "unmatched") metrics.unmatchedInsuranceCount += 1;
    if (record?.rawPercentKind === "unknown" || record?.rawPercentBasis === "unknown") {
      metrics.unknownInsuranceSemanticCount += 1;
    }
  }

  if (metrics.duplicateProductIdCount) blockers.push(`${metrics.duplicateProductIdCount} Product ID تکراری وجود دارد.`);
  if (metrics.duplicateNfiDetailIdCount) blockers.push(`${metrics.duplicateNfiDetailIdCount} NFI Detail ID تکراری وجود دارد.`);
  if (metrics.suspiciousSearchScopeCount) blockers.push(`${metrics.suspiciousSearchScopeCount} جست‌وجوی NFI دامنه مشکوک/بیش‌ازحد بزرگ دارد.`);
  if (metrics.genericCodeIdentityCollisionCount > 5) blockers.push(`${metrics.genericCodeIdentityCollisionCount} NFI Generic Code به بیش از یک هویت Generic ناسازگار map شده است.`);

  const mergedThreshold = Math.max(10, Math.ceil(products.length * 0.05));
  if (metrics.mergedGenericWithoutComponentsCount > mergedThreshold) {
    blockers.push(`${metrics.mergedGenericWithoutComponentsCount} Product نام Generic ادغام‌شده با ; دارد ولی component evidence ندارد؛ احتمال cross-query contamination بالاست.`);
  }

  const multiCodeThreshold = Math.max(50, Math.ceil(products.length * 0.25));
  if (metrics.multipleNfiCodesFlagCount > multiCodeThreshold) {
    blockers.push(`${metrics.multipleNfiCodesFlagCount} Product پرچم MULTIPLE_NFI_CODES_FOR_ONE_PRESENTATION دارد؛ این نرخ برای Publish ایمن نیست.`);
  }

  if (metrics.packageConfidenceConflictCount) {
    warnings.push(`${metrics.packageConfidenceConflictCount} Product هم PACKAGE_UNRESOLVED و هم packageParserConfidence>=0.8 دارد؛ semantics Package باید بازبینی شود.`);
  }
  if (metrics.ambiguousInsuranceCount) warnings.push(`${metrics.ambiguousInsuranceCount} رکورد بیمه ambiguous است و نباید به Runtime ranking وارد شود.`);
  if (metrics.unmatchedInsuranceCount) warnings.push(`${metrics.unmatchedInsuranceCount} رکورد بیمه unmatched است.`);
  if (metrics.unknownInsuranceSemanticCount) warnings.push(`${metrics.unknownInsuranceSemanticCount} رکورد بیمه semantics نامشخص دارد و باید از محاسبات مالی کنار گذاشته شود.`);

  return {
    schemaVersion: root?.schemaVersion === 2 ? 2 : null,
    acceptedForStaging: blockers.length === 0,
    blockers,
    warnings,
    metrics,
  };
}
