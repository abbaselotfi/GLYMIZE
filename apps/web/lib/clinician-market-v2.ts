import type {
  InsuranceCoverage,
  MedicationBrand,
  MedicationMarketBadge,
  MedicationPrice,
  MedicationPriceRange,
  ReferenceMedicationPresentation,
} from "@glymize/contracts";
import { withBasePath } from "./base-path";

type MarketComponent = {
  canonicalName: string;
  strengthValue?: number | null;
  strengthUnit?: string | null;
  concentrationValue?: number | null;
  concentrationUnit?: string | null;
};

// GLYMIZE_MARKET_V23_INTEGRATION
export type ClinicianMedicationCostingProfile = {
  basis: string;
  dailyInputUnit: string;
  packageMeasureUnit: string;
  packageMeasureQuantity?: number;
  autoFillEligible: boolean;
  reviewRequired: boolean;
  sourceProductCount: number;
  packageVariantCount: number;
  displayContainerCount?: number;
  displayContainerUnit?: string;
  displayQuantityPerContainer?: number;
  displayQuantityPerContainerUnit?: string;
  derivationStatus?: string;
};

type MarketCostingProfile = {
  basis?: string | null;
  dailyInputUnit?: string | null;
  packageMeasureUnit?: string | null;
  packageMeasureQuantity?: number | null;
  autoFillEligible?: boolean | null;
  reviewRequired?: boolean | null;
  displayContainerCount?: number | null;
  displayContainerUnit?: string | null;
  displayQuantityPerContainer?: number | null;
  displayQuantityPerContainerUnit?: string | null;
  derivationStatus?: string | null;
};

type MarketPackage = {
  packageRaw?: string | null;
  packageIdentityResolved?: boolean | null;
  containerCount?: number | null;
  containerType?: string | null;
  quantityPerContainer?: number | null;
  quantityPerContainerUnit?: string | null;
  totalPackageQuantity?: number | null;
  totalPackageQuantityUnit?: string | null;
  volumePerContainerMl?: number | null;
  totalVolumeMl?: number | null;
  unitsPerPackage?: number | null;
  unitType?: string | null;
  totalActuationsPerPackage?: number | null;
};

type MarketInsulinPackage = {
  insulinComponentName?: string | null;
  insulinConcentrationUnitsPerMl?: number | null;
  volumePerContainerMl?: number | null;
  containerCount?: number | null;
  totalVolumeMl?: number | null;
  totalInsulinUnitsPerContainer?: number | null;
  totalInsulinUnitsPerPackage?: number | null;
  calculationStatus?: string | null;
  derivationStatus?: string | null;
};

type MarketProduct = {
  productId: string;
  generic: {
    canonicalName: string;
    nameEn?: string | null;
    nameFa?: string | null;
    genericRegistryCode?: string | null;
  };
  product: {
    brandName?: string | null;
    brandRegistryCode?: string | null;
    ircCode?: string | null;
    gtin?: string | null;
    atcCode?: string | null;
    dosageFormNormalized?: string | null;
    releaseType?: string | null;
    route?: string | null;
    strengthRaw?: string | null;
    strengthValue?: number | null;
    strengthUnit?: string | null;
    components?: MarketComponent[];
    costingProfile?: MarketCostingProfile | null;
    package?: MarketPackage | null;
    insulinPackage?: MarketInsulinPackage | null;
    doseRelationship?: {
      primaryComponent?: string | null;
      primaryDoseUnit?: string | null;
      secondaryComponent?: string | null;
      secondaryAmountPerPrimaryUnit?: number | null;
      secondaryAmountUnit?: string | null;
      derivationStatus?: string | null;
    } | null;
    deviceType?: string | null;
    deviceSubtype?: string | null;
    packageRaw?: string | null;
    packageIdentityResolved?: boolean | null;
    doseUnitQuantityResolved?: boolean | null;
    unitsPerPackage?: number | null;
    unitType?: string | null;
    containerCount?: number | null;
    volumePerContainerMl?: number | null;
    totalVolumeMl?: number | null;
    unitsPerMl?: number | null;
    totalDoseUnitsPerPackage?: number | null;
    manufacturerName?: string | null;
    licenseStatus?: string | null;
    availabilityStatus?: string | null;
  };
  market: {
    nfiVerificationStatus: string;
    nfiUrl?: string | null;
    observedAt?: string | null;
    reviewRequired?: boolean | null;
  };
  price?: {
    amountToman?: number | null;
    rawAmount?: number | null;
    rawCurrency?: string | null;
    priceBasis?: string | null;
    observedAt?: string | null;
  } | null;
  qualityFlags?: string[];
};

// GLYMIZE_MARKET_V23_SEARCH_SUMMARY_HOTFIX
type MarketSummary = {
  summaryId: string;
  kind?: "nfi_presentation" | "nfi_search_status" | string;
  genericCanonicalName?: string | null;
  genericName?: string | null;
  nfiVerificationStatus: string;
  priceSummary?: {
    minToman: number;
    medianToman: number;
    maxToman: number;
    productCount: number;
    pricedProductCount?: number;
    comparable: boolean;
    comparisonKey?: string;
  } | null;
  productIds: string[];
  qualityFlags?: string[];
};

type MarketInsurance = {
  insuranceRecordId?: string | null;
  provider: InsuranceCoverage["provider"];
  genericCode?: string | null;
  rawPercent?: number | null;
  rawPercentKind?: string | null;
  rawPercentBasis?: string | null;
  normalizedInsurerCoveragePercent?: number | null;
  normalizedPatientSharePercent?: number | null;
  normalizedPercentDerived?: boolean | null;
  serviceGroup?: string | null;
  conditions?: string | null;
  observedAt?: string | null;
  sourceFieldName?: string | null;
  sourceUrl?: string | null;
  match?: {
    status?: string | null;
    matchedGenericRegistryCode?: string | null;
    matchedProductId?: string | null;
    candidateProductIds?: string[];
  } | null;
};

export type ClinicianMarketIndex = {
  schemaVersion: 2;
  kind: "glymize_clinician_market_index";
  scopeMode: "full_clinical_market";
  generatedAt?: string;
  canonicalSha256?: string;
  sourceSemanticValidation?: Record<string, number>;
  sourceCalculationValidation?: Record<string, number>;
  runtimeIntegrity?: {
    canonicalProductCount?: number;
    runtimeProductCount?: number;
    productRetentionPercent?: number;
    missingCanonicalProductIds?: string[];
    unexpectedRuntimeProductIds?: string[];
  };
  scope?: {
    productCount?: number;
    genericCount?: number;
    presentationSummaryCount?: number;
    insuranceRecordCount?: number;
  };
  products: MarketProduct[];
  presentationSummaries: MarketSummary[];
  insuranceRecords: MarketInsurance[];
};

type PresentationRuntimeData = {
  brands: MedicationBrand[];
  insuranceCoverages: InsuranceCoverage[];
  genericRegistryCode?: string;
  priceRange?: MedicationPriceRange;
  marketBadge: MedicationMarketBadge;
  sourceObservedAt?: string;
  sourceUrl: string;
};

let marketIndex: ClinicianMarketIndex | null = null;
let marketLoadPromise: Promise<void> | null = null;
let productById = new Map<string, MarketProduct>();
let summaryByPresentationId = new Map<string, MarketSummary>();
let insuranceByGenericCode = new Map<string, InsuranceCoverage[]>();
let presentationDataById = new Map<string, PresentationRuntimeData>();
let presentationsCache: ReferenceMedicationPresentation[] = [];
let summariesByGenericKey = new Map<string, MarketSummary[]>();
let genericPriceRangeCache = new Map<string, MedicationPriceRange | null>();
let productsByGenericKey = new Map<string, MarketProduct[]>();
let costingProfileCache = new Map<string, ClinicianMedicationCostingProfile | null>();

function normalizedTerms(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join("|");
}

function presentationId(summaryId: string) {
  return `market-v2:${summaryId.replace(/^presentation:/, "")}`;
}

function isMarketPresentationSummary(
  summary: MarketSummary,
): summary is MarketSummary & { genericCanonicalName: string } {
  return (
    summary.kind !== "nfi_search_status" &&
    typeof summary.genericCanonicalName === "string" &&
    summary.genericCanonicalName.trim().length > 0 &&
    summary.productIds.length > 0
  );
}

function sourceCurrency(value?: string | null): "IRR" | "TOMAN" | undefined {
  if (value === "IRR" || value === "TOMAN") return value;
  return undefined;
}

function productPrice(product: MarketProduct): MedicationPrice | undefined {
  const amount = product.price?.amountToman;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return undefined;
  return {
    amountToman: amount,
    priceKind: "consumer_retail",
    sourceAmount: typeof product.price?.rawAmount === "number" ? product.price.rawAmount : undefined,
    sourceCurrency: sourceCurrency(product.price?.rawCurrency),
    effectiveAt: product.price?.observedAt ?? product.market.observedAt ?? undefined,
    sourceUrl: product.market.nfiUrl ?? "https://irc.fda.gov.ir/nfi",
    sourceReference: product.productId,
  };
}

function componentStrength(product: MarketProduct) {
  const components = product.product.components ?? [];
  if (components.length >= 2) {
    return components
      .map((component) => {
        const value = component.strengthValue ?? component.concentrationValue;
        const unit = component.strengthUnit ?? component.concentrationUnit ?? "";
        return value === null || value === undefined
          ? component.canonicalName
          : `${component.canonicalName} ${value} ${unit}`.trim();
      })
      .join(" + ");
  }
  if (product.product.strengthValue !== null && product.product.strengthValue !== undefined) {
    return `${product.product.strengthValue} ${product.product.strengthUnit ?? ""}`.trim();
  }
  return product.product.strengthRaw ?? "NFI presentation";
}

function marketBadge(): MedicationMarketBadge {
  return {
    key: "iran-nfi-verified-v2",
    labelFa: "تأییدشده در NFI ایران",
    labelEn: "Iran NFI verified",
    tone: "blue",
    confirmedByAdmin: false,
  };
}

function brandForProduct(product: MarketProduct, priority: number): MedicationBrand {
  return {
    id: `market-v2-brand:${product.productId}`,
    name: product.product.brandName?.trim() || product.generic.nameFa?.trim() || product.generic.nameEn?.trim() || product.generic.canonicalName,
    showInsteadOfGeneric: false,
    priority,
    customInsurance: false,
    insuranceCoverages: [],
    genericRegistryCode: product.generic.genericRegistryCode ?? undefined,
    brandRegistryCode: product.product.brandRegistryCode ?? undefined,
    price: productPrice(product),
    sourceDiscovered: true,
    sourceUrl: product.market.nfiUrl ?? "https://irc.fda.gov.ir/nfi",
    sourceObservedAt: product.market.observedAt ?? undefined,
    hiddenFromSource: product.product.availabilityStatus !== "active",
    marketBadge: marketBadge(),
    marketProductId: product.productId,
    marketPackageRaw: product.product.packageRaw ?? undefined,
    marketUnitsPerPackage: product.product.unitsPerPackage ?? undefined,
    marketUnitType: product.product.unitType ?? undefined,
  };
}

function insuranceCoverageFromRecord(record: MarketInsurance): InsuranceCoverage | undefined {
  const matchedGenericCode = record.match?.matchedGenericRegistryCode;
  if (
    record.match?.status !== "matched" ||
    record.match?.matchedProductId ||
    !matchedGenericCode ||
    typeof record.normalizedInsurerCoveragePercent !== "number"
  ) return undefined;

  return {
    provider: record.provider,
    percent: record.normalizedInsurerCoveragePercent,
    origin: "source",
    genericCode: matchedGenericCode,
    effectiveAt: record.observedAt ?? undefined,
    sourceUrl: record.sourceUrl ?? undefined,
    sourceReference: record.insuranceRecordId ?? record.sourceFieldName ?? undefined,
    sourcePercent: record.rawPercent ?? undefined,
    sourcePercentKind: record.rawPercentKind as InsuranceCoverage["sourcePercentKind"],
    sourcePercentBasis: record.rawPercentBasis as InsuranceCoverage["sourcePercentBasis"],
    normalizedPercentDerived: record.normalizedPercentDerived ?? undefined,
    sourcePatientSharePercent: record.normalizedPatientSharePercent ?? undefined,
    conditions: record.conditions ?? undefined,
    serviceGroup: record.serviceGroup ?? undefined,
    runtimeEligibleForRanking: !record.conditions,
  };
}

function insuranceForGenericCodes(codes: Set<string>): InsuranceCoverage[] {
  if (!codes.size) return [];
  const result: InsuranceCoverage[] = [];
  for (const code of codes) {
    const matches = insuranceByGenericCode.get(code);
    if (matches?.length) result.push(...matches);
  }
  return result;
}

function buildPresentationRuntimeData(
  summary: MarketSummary,
  products: MarketProduct[],
): PresentationRuntimeData | undefined {
  if (!products.length) return undefined;

  const genericCodes = new Set(
    products
      .map((product) => product.generic.genericRegistryCode)
      .filter((value): value is string => Boolean(value)),
  );
  const uniqueGenericCode =
    genericCodes.size === 1 ? [...genericCodes][0] : undefined;
  const priceSummary = summary.priceSummary;
  const priceRange: MedicationPriceRange | undefined =
    priceSummary && priceSummary.comparable
      ? {
          minToman: priceSummary.minToman,
          medianToman: priceSummary.medianToman,
          maxToman: priceSummary.maxToman,
          productCount:
            priceSummary.pricedProductCount ?? priceSummary.productCount,
          basis: "nfi_comparable_products",
          costComparable: true,
          presentationCount: 1,
        }
      : undefined;

  return {
    brands: products.map(brandForProduct),
    insuranceCoverages: insuranceForGenericCodes(genericCodes),
    genericRegistryCode: uniqueGenericCode,
    priceRange,
    marketBadge: marketBadge(),
    sourceObservedAt: products
      .map((product) => product.market.observedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1),
    sourceUrl:
      products[0]?.market.nfiUrl ?? "https://irc.fda.gov.ir/nfi",
  };
}

function buildIndexes() {
  if (!marketIndex) {
    productById = new Map();
    summaryByPresentationId = new Map();
    insuranceByGenericCode = new Map();
    presentationDataById = new Map();
    presentationsCache = [];
    summariesByGenericKey = new Map();
    genericPriceRangeCache = new Map();
    productsByGenericKey = new Map();
    costingProfileCache = new Map();
    return;
  }

  const index = marketIndex;
  productById = new Map(
    index.products.map((product) => [product.productId, product]),
  );
  summaryByPresentationId = new Map(
    index.presentationSummaries
      .filter(isMarketPresentationSummary)
      .map((summary) => [
        presentationId(summary.summaryId),
        summary,
      ]),
  );

  insuranceByGenericCode = new Map();
  for (const record of index.insuranceRecords) {
    const coverage = insuranceCoverageFromRecord(record);
    const code = record.match?.matchedGenericRegistryCode;
    if (!coverage || !code) continue;
    const current = insuranceByGenericCode.get(code);
    if (current) current.push(coverage);
    else insuranceByGenericCode.set(code, [coverage]);
  }

  presentationDataById = new Map();
  presentationsCache = [];
  summariesByGenericKey = new Map();
  genericPriceRangeCache = new Map();
  productsByGenericKey = new Map();
  costingProfileCache = new Map();

  for (const product of index.products) {
    const key = normalizedTerms(product.generic.canonicalName);
    const current = productsByGenericKey.get(key);
    if (current) current.push(product);
    else productsByGenericKey.set(key, [product]);
  }

  for (const summary of index.presentationSummaries.filter(isMarketPresentationSummary)) {
    const id = presentationId(summary.summaryId);
    const products = summary.productIds
      .map((productId) => productById.get(productId))
      .filter((item): item is MarketProduct => Boolean(item));

    const runtimeData = buildPresentationRuntimeData(summary, products);
    if (runtimeData) presentationDataById.set(id, runtimeData);

    const key = normalizedTerms(summary.genericCanonicalName);
    const genericSummaries = summariesByGenericKey.get(key);
    if (genericSummaries) genericSummaries.push(summary);
    else summariesByGenericKey.set(key, [summary]);

    const first = products[0];
    if (!first || first.market.nfiVerificationStatus !== "nfi_verified") {
      continue;
    }

    presentationsCache.push({
      id,
      therapeuticClass: first.product.atcCode ?? "Clinical market",
      mechanismOrSubclass: "Iran FDA NFI market presentation",
      genericName: summary.genericCanonicalName,
      administrationRoute: first.product.route ?? "unknown",
      dosageForm: first.product.dosageFormNormalized ?? "unknown",
      strengthPresentation: componentStrength(first),
      sampleBrands: products
        .map((product) => product.product.brandName)
        .filter(Boolean)
        .slice(0, 6)
        .join("، "),
      marketStatus: "active",
      sourceUrl:
        first.market.nfiUrl ?? "https://irc.fda.gov.ir/nfi",
      sourceFile: "glymize-clinician-market-v2.json",
      sourceObservedAt:
        first.market.observedAt ??
        index.generatedAt ??
        new Date(0).toISOString(),
      reviewState: "validated_for_iran",
    });
  }
}

export async function loadClinicianMarketV2() {
  if (marketIndex || typeof window === "undefined") return;
  if (marketLoadPromise) return marketLoadPromise;
  marketLoadPromise = (async () => {
    let runtimeVersion = "v2";
    try {
      const metaResponse = await fetch(
        `${withBasePath("/data/glymize-clinician-market-v2.meta.json")}?t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (metaResponse.ok) {
        const meta = await metaResponse.json() as { deploymentSha256?: string; canonicalSha256?: string };
        runtimeVersion = meta.deploymentSha256 ?? meta.canonicalSha256 ?? runtimeVersion;
      }
    } catch {
      // Runtime remains usable if the small metadata file is temporarily unavailable.
    }

    const response = await fetch(
      `${withBasePath("/data/glymize-clinician-market-v2.json")}?v=${encodeURIComponent(runtimeVersion)}`,
      { cache: "force-cache" },
    );
    if (!response.ok) throw new Error(`clinician_market_v2_http_${response.status}`);
    const parsed = await response.json() as ClinicianMarketIndex;
    if (parsed.schemaVersion !== 2 || parsed.kind !== "glymize_clinician_market_index") throw new Error("clinician_market_v2_schema_invalid");
    if (parsed.scopeMode !== "full_clinical_market") throw new Error("clinician_market_v2_scope_not_full");
    if ((parsed.scope?.productCount ?? 0) !== parsed.products.length) throw new Error("clinician_market_v2_product_count_mismatch");
    const hasA10 = parsed.products.some((item) => (item.product.atcCode ?? "").split(";")[0]!.trim().startsWith("A10"));
    const hasNonA10 = parsed.products.some((item) => {
      const atc = (item.product.atcCode ?? "").split(";")[0]!.trim();
      return Boolean(atc) && !atc.startsWith("A10");
    });
    if (!hasA10 || !hasNonA10) throw new Error("clinician_market_v2_therapeutic_scope_regression");
    const gates = parsed.sourceSemanticValidation ?? {};
    for (const key of [
      "crossQueryContaminationCount",
      "genericCodeIdentityCollisionCount",
      "productsWithMergedQueryNamesWithoutComponents",
      "suspiciousSearchScopeCount",
      "combinationProductsWithoutComponentsCount",
      "unsafeComparableCombinationSummaryCount",
    ]) {
      if ((gates[key] ?? 0) !== 0) throw new Error(`clinician_market_v2_gate_failed:${key}`);
    }
    const integrity = parsed.runtimeIntegrity;
    if (
      !integrity ||
      integrity.productRetentionPercent !== 100 ||
      integrity.canonicalProductCount !== parsed.products.length ||
      integrity.runtimeProductCount !== parsed.products.length ||
      (integrity.missingCanonicalProductIds?.length ?? 0) !== 0 ||
      (integrity.unexpectedRuntimeProductIds?.length ?? 0) !== 0
    ) {
      throw new Error("clinician_market_v2_retention_gate_failed");
    }

    const calculation = parsed.sourceCalculationValidation ?? {};
    if ((calculation.packageDerivationErrorCount ?? -1) !== 0) {
      throw new Error("clinician_market_v2_package_derivation_gate_failed");
    }
    if (
      (calculation.insulinProductsCount ?? -1) !==
      (calculation.insulinProductsWithResolvedTotalUnitsPerPackageCount ?? -2)
    ) {
      throw new Error("clinician_market_v2_insulin_package_gate_failed");
    }

    marketIndex = parsed;
    buildIndexes();
  })();
  return marketLoadPromise;
}

export function clinicianMarketPresentations(): ReferenceMedicationPresentation[] {
  return presentationsCache;
}

export function isClinicianMarketPresentation(id: string) {
  return summaryByPresentationId.has(id);
}

export function clinicianMarketPresentationData(
  id: string,
): PresentationRuntimeData | undefined {
  return presentationDataById.get(id);
}


function consensusValue<T extends string | number>(values: Array<T | null | undefined>): T | undefined {
  const defined = values.filter((value): value is T => value !== null && value !== undefined);
  if (!defined.length) return undefined;
  const unique = new Set(defined);
  return unique.size === 1 ? defined[0] : undefined;
}

export function clinicianCostingProfileForMedication(
  genericName: string,
  brandRegistryCode?: string,
): ClinicianMedicationCostingProfile | undefined {
  const genericKey = normalizedTerms(genericName);
  const cacheKey = `${genericKey}|${brandRegistryCode ?? "*"}`;
  if (costingProfileCache.has(cacheKey)) {
    return costingProfileCache.get(cacheKey) ?? undefined;
  }

  const genericProducts = (productsByGenericKey.get(genericKey) ?? [])
    .filter((product) => product.market.nfiVerificationStatus === "nfi_verified");
  const brandProducts = brandRegistryCode
    ? genericProducts.filter((product) => product.product.brandRegistryCode === brandRegistryCode)
    : [];
  const products = brandProducts.length ? brandProducts : genericProducts;
  const profiles = products
    .map((product) => product.product.costingProfile)
    .filter((profile): profile is MarketCostingProfile => Boolean(profile));

  if (!profiles.length) {
    costingProfileCache.set(cacheKey, null);
    return undefined;
  }

  const nonUnknown = profiles.filter((profile) => profile.basis && profile.basis !== "unknown");
  const basis = consensusValue(nonUnknown.map((profile) => profile.basis));
  const dailyInputUnit = consensusValue(nonUnknown.map((profile) => profile.dailyInputUnit));
  const packageMeasureUnit = consensusValue(nonUnknown.map((profile) => profile.packageMeasureUnit));
  if (!basis || !dailyInputUnit || !packageMeasureUnit) {
    const ambiguous: ClinicianMedicationCostingProfile = {
      basis: "unknown",
      dailyInputUnit: "unit",
      packageMeasureUnit: "unit",
      autoFillEligible: false,
      reviewRequired: true,
      sourceProductCount: products.length,
      packageVariantCount: 0,
      derivationStatus: "ambiguous",
    };
    costingProfileCache.set(cacheKey, ambiguous);
    return ambiguous;
  }

  const quantities = nonUnknown
    .map((profile) => profile.packageMeasureQuantity)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const uniqueQuantities = new Set(quantities);
  const allProfilesResolved =
    nonUnknown.length === profiles.length &&
    nonUnknown.every((profile) => profile.autoFillEligible === true && profile.reviewRequired !== true);
  const packageMeasureQuantity =
    allProfilesResolved && uniqueQuantities.size === 1
      ? quantities[0]
      : undefined;
  const autoFillEligible = packageMeasureQuantity !== undefined;

  const result: ClinicianMedicationCostingProfile = {
    basis,
    dailyInputUnit,
    packageMeasureUnit,
    packageMeasureQuantity,
    autoFillEligible,
    reviewRequired: !autoFillEligible || profiles.some((profile) => profile.reviewRequired === true),
    sourceProductCount: products.length,
    packageVariantCount: uniqueQuantities.size,
    displayContainerCount: consensusValue(nonUnknown.map((profile) => profile.displayContainerCount)),
    displayContainerUnit: consensusValue(nonUnknown.map((profile) => profile.displayContainerUnit)),
    displayQuantityPerContainer: consensusValue(nonUnknown.map((profile) => profile.displayQuantityPerContainer)),
    displayQuantityPerContainerUnit: consensusValue(nonUnknown.map((profile) => profile.displayQuantityPerContainerUnit)),
    derivationStatus: autoFillEligible
      ? consensusValue(nonUnknown.map((profile) => profile.derivationStatus)) ?? "verified_or_deterministic"
      : "ambiguous_package",
  };
  costingProfileCache.set(cacheKey, result);
  return result;
}

export function clinicianGenericDisplayPriceRange(
  genericName: string,
): MedicationPriceRange | undefined {
  if (!marketIndex) return undefined;
  const key = normalizedTerms(genericName);

  if (genericPriceRangeCache.has(key)) {
    return genericPriceRangeCache.get(key) ?? undefined;
  }

  const summaries = summariesByGenericKey.get(key) ?? [];
  const prices = summaries
    .flatMap((summary) =>
      summary.productIds
        .map((productId) => productById.get(productId)?.price?.amountToman)
        .filter(
          (value): value is number =>
            typeof value === "number" &&
            Number.isFinite(value) &&
            value >= 0,
        ),
    )
    .sort((left, right) => left - right);

  if (!prices.length) {
    genericPriceRangeCache.set(key, null);
    return undefined;
  }

  const middle = Math.floor(prices.length / 2);
  const medianToman =
    prices.length % 2
      ? prices[middle]!
      : Math.round((prices[middle - 1]! + prices[middle]!) / 2);
  const singleComparablePresentation =
    summaries.length === 1 &&
    summaries[0]?.priceSummary?.comparable === true;

  const result: MedicationPriceRange = {
    minToman: prices[0]!,
    medianToman,
    maxToman: prices[prices.length - 1]!,
    productCount: prices.length,
    basis: singleComparablePresentation
      ? "nfi_comparable_products"
      : "nfi_generic_market_range",
    costComparable: singleComparablePresentation,
    presentationCount: summaries.length,
  };
  genericPriceRangeCache.set(key, result);
  return result;
}
