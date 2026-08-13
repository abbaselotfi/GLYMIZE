type UnknownRecord = Record<string, unknown>;

const semanticGateKeys = [
  "crossQueryContaminationCount",
  "genericCodeIdentityCollisionCount",
  "productsWithMergedQueryNamesWithoutComponents",
  "suspiciousSearchScopeCount",
  "combinationProductsWithoutComponentsCount",
  "unsafeComparableCombinationSummaryCount",
] as const;

function objectValue(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export interface ClinicianMarketV23Metrics {
  productCount: number;
  genericCount: number;
  presentationSummaryCount: number;
  verifiedPresentationCount: number;
  insuranceRecordCount: number;
  runtimeEligibleInsuranceRecordCount: number;
  productRetentionPercent: number;
  costingProfileResolvedCount: number;
  costingProfileAmbiguousCount: number;
  packageResolvedCount: number;
  packageDerivationErrorCount: number;
  insulinProductsCount: number;
  insulinResolvedCount: number;
  tabletCapsuleProductsCount: number;
  tabletCapsuleResolvedCount: number;
  liquidProductsCount: number;
  liquidResolvedCount: number;
  inhalerProductsCount: number;
  inhalerResolvedCount: number;
}

export interface ClinicianMarketV23PreflightResult {
  acceptedForDeployment: boolean;
  blockers: string[];
  warnings: string[];
  canonicalSha256?: string;
  generatedAt?: string;
  metrics: ClinicianMarketV23Metrics;
}

export function preflightClinicianMarketV23(value: unknown): ClinicianMarketV23PreflightResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const root = objectValue(value);
  const products = arrayValue(root?.products);
  const presentationSummaries = arrayValue(root?.presentationSummaries);
  const scope = objectValue(root?.scope);
  const integrity = objectValue(root?.runtimeIntegrity);
  const semantic = objectValue(root?.sourceSemanticValidation);
  const calculation = objectValue(root?.sourceCalculationValidation);

  if (!root || root.schemaVersion !== 2) blockers.push("Runtime باید schemaVersion=2 داشته باشد.");
  if (root?.kind !== "glymize_clinician_market_index") blockers.push("kind فایل Runtime معتبر نیست.");
  if (root?.scopeMode !== "full_clinical_market") blockers.push("Runtime باید scopeMode=full_clinical_market داشته باشد.");
  if (!products.length) blockers.push("هیچ Product در Runtime وجود ندارد.");

  const metrics: ClinicianMarketV23Metrics = {
    productCount: products.length,
    genericCount: numberValue(scope?.genericCount) ?? 0,
    presentationSummaryCount: numberValue(scope?.presentationSummaryCount) ?? presentationSummaries.length,
    verifiedPresentationCount: presentationSummaries.filter((raw) => {
      const item = objectValue(raw);
      return (
        item?.kind === "nfi_presentation" &&
        item?.nfiVerificationStatus === "nfi_verified" &&
        Boolean(textValue(item?.genericCanonicalName)) &&
        arrayValue(item?.productIds).length > 0
      );
    }).length,
    insuranceRecordCount: numberValue(scope?.insuranceRecordCount) ?? arrayValue(root?.insuranceRecords).length,
    runtimeEligibleInsuranceRecordCount: numberValue(scope?.runtimeEligibleInsuranceRecordCount) ?? 0,
    productRetentionPercent: numberValue(integrity?.productRetentionPercent) ?? 0,
    costingProfileResolvedCount: numberValue(calculation?.productsWithResolvedCostingProfileCount) ?? 0,
    costingProfileAmbiguousCount: numberValue(calculation?.costingProfileAmbiguousCount) ?? 0,
    packageResolvedCount: numberValue(calculation?.productsWithResolvedPackageCount) ?? 0,
    packageDerivationErrorCount: numberValue(calculation?.packageDerivationErrorCount) ?? -1,
    insulinProductsCount: numberValue(calculation?.insulinProductsCount) ?? 0,
    insulinResolvedCount: numberValue(calculation?.insulinProductsWithResolvedTotalUnitsPerPackageCount) ?? 0,
    tabletCapsuleProductsCount: numberValue(calculation?.tabletCapsuleProductsCount) ?? 0,
    tabletCapsuleResolvedCount: numberValue(calculation?.tabletCapsuleProductsWithResolvedUnitsPerPackageCount) ?? 0,
    liquidProductsCount: numberValue(calculation?.liquidProductsCount) ?? 0,
    liquidResolvedCount: numberValue(calculation?.liquidProductsWithResolvedTotalVolumeCount) ?? 0,
    inhalerProductsCount: numberValue(calculation?.inhalerProductsCount) ?? 0,
    inhalerResolvedCount: numberValue(calculation?.inhalerProductsWithResolvedActuationCount) ?? 0,
  };

  if (numberValue(scope?.productCount) !== products.length) {
    blockers.push("scope.productCount با تعداد واقعی Productها یکسان نیست.");
  }
  if (numberValue(integrity?.canonicalProductCount) !== products.length ||
      numberValue(integrity?.runtimeProductCount) !== products.length ||
      metrics.productRetentionPercent !== 100) {
    blockers.push("Product retention برابر 100% نیست.");
  }
  if (arrayValue(integrity?.missingCanonicalProductIds).length > 0) {
    blockers.push("Runtime تعدادی Product canonical را از دست داده است.");
  }
  if (arrayValue(integrity?.unexpectedRuntimeProductIds).length > 0) {
    blockers.push("Runtime Product غیرمنتظره نسبت به canonical دارد.");
  }

  for (const key of semanticGateKeys) {
    if ((numberValue(semantic?.[key]) ?? -1) !== 0) {
      blockers.push(`Semantic gate ${key} باید صفر باشد.`);
    }
  }

  if (metrics.packageDerivationErrorCount !== 0) {
    blockers.push("packageDerivationErrorCount باید صفر باشد.");
  }
  if (metrics.insulinProductsCount !== metrics.insulinResolvedCount) {
    blockers.push("همه فرآورده‌های insulin باید total units/package حل‌شده داشته باشند.");
  }
  if (metrics.costingProfileResolvedCount + metrics.costingProfileAmbiguousCount !== products.length) {
    blockers.push("جمع Costing Profileهای resolved و ambiguous با Product count برابر نیست.");
  }

  if (metrics.costingProfileAmbiguousCount > 0) {
    warnings.push(`${metrics.costingProfileAmbiguousCount} Product Costing Profile مبهم دارد؛ برای آنها Auto-fill بسته غیرفعال می‌ماند.`);
  }
  if (metrics.tabletCapsuleResolvedCount < metrics.tabletCapsuleProductsCount) {
    warnings.push(`${metrics.tabletCapsuleProductsCount - metrics.tabletCapsuleResolvedCount} فرآورده tablet/capsule اندازه بسته حل‌نشده دارد.`);
  }
  if (metrics.liquidResolvedCount < metrics.liquidProductsCount) {
    warnings.push(`${metrics.liquidProductsCount - metrics.liquidResolvedCount} فرآورده مایع total volume حل‌نشده دارد.`);
  }
  if (metrics.inhalerResolvedCount < metrics.inhalerProductsCount) {
    warnings.push(`${metrics.inhalerProductsCount - metrics.inhalerResolvedCount} inhaler actuation count حل‌نشده دارد.`);
  }

  return {
    acceptedForDeployment: blockers.length === 0,
    blockers,
    warnings,
    canonicalSha256: textValue(root?.canonicalSha256) || undefined,
    generatedAt: textValue(root?.generatedAt) || undefined,
    metrics,
  };
}

/**
 * Produces the browser deployment runtime.
 * Every Product and structured package/costing field is retained.
 * Audit-heavy duplicates stay in canonical/extractor outputs instead.
 */
export function buildClinicianMarketDeploymentRuntime(value: unknown): UnknownRecord {
  const root = objectValue(value);
  if (!root) throw new Error("runtime_not_object");

  const products = arrayValue(root.products).map((raw) => {
    const item = objectValue(raw);
    if (!item) return raw;

    const {
      fieldProvenance: _fieldProvenance,
      fingerprints: _fingerprints,
      search: _search,
      product: rawProduct,
      ...rest
    } = item;

    const product = objectValue(rawProduct);
    const {
      derivationMetadata: _derivationMetadata,
      ...productCore
    } = product ?? {};

    return {
      ...rest,
      product: productCore,
    };
  });

  return {
    ...root,
    products,
  };
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
