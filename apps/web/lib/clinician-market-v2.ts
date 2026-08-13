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

type MarketSummary = {
  summaryId: string;
  genericCanonicalName: string;
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

function insuranceForGenericCodes(codes: Set<string>): InsuranceCoverage[] {
  if (!marketIndex || !codes.size) return [];
  return marketIndex.insuranceRecords
    .filter((record) =>
      record.match?.status === "matched" &&
      !record.match?.matchedProductId &&
      Boolean(record.match?.matchedGenericRegistryCode && codes.has(record.match.matchedGenericRegistryCode)) &&
      typeof record.normalizedInsurerCoveragePercent === "number"
    )
    .map((record) => ({
      provider: record.provider,
      percent: record.normalizedInsurerCoveragePercent!,
      origin: "source" as const,
      genericCode: record.match?.matchedGenericRegistryCode ?? record.genericCode ?? undefined,
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
    }));
}

function buildIndexes() {
  productById = new Map((marketIndex?.products ?? []).map((product) => [product.productId, product]));
  summaryByPresentationId = new Map((marketIndex?.presentationSummaries ?? []).map((summary) => [presentationId(summary.summaryId), summary]));
}

export async function loadClinicianMarketV2() {
  if (marketIndex || typeof window === "undefined") return;
  if (marketLoadPromise) return marketLoadPromise;
  marketLoadPromise = (async () => {
    const response = await fetch(`${withBasePath("/data/glymize-clinician-market-v2.json")}?t=${Date.now()}`, { cache: "no-store" });
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
    marketIndex = parsed;
    buildIndexes();
  })();
  return marketLoadPromise;
}

export function clinicianMarketPresentations(): ReferenceMedicationPresentation[] {
  if (!marketIndex) return [];
  const index = marketIndex;
  return index.presentationSummaries.flatMap((summary) => {
    const products = summary.productIds.map((id) => productById.get(id)).filter((item): item is MarketProduct => Boolean(item));
    const first = products[0];
    if (!first || first.market.nfiVerificationStatus !== "nfi_verified") return [];
    return [{
      id: presentationId(summary.summaryId),
      therapeuticClass: first.product.atcCode ?? "A10",
      mechanismOrSubclass: "Iran FDA NFI market presentation",
      genericName: summary.genericCanonicalName,
      administrationRoute: first.product.route ?? "unknown",
      dosageForm: first.product.dosageFormNormalized ?? "unknown",
      strengthPresentation: componentStrength(first),
      sampleBrands: products.map((product) => product.product.brandName).filter(Boolean).slice(0, 6).join("، "),
      marketStatus: "active",
      sourceUrl: first.market.nfiUrl ?? "https://irc.fda.gov.ir/nfi",
      sourceFile: "glymize-clinician-market-v2.json",
      sourceObservedAt: first.market.observedAt ?? index.generatedAt ?? new Date(0).toISOString(),
      reviewState: "validated_for_iran",
    }];
  });
}

export function isClinicianMarketPresentation(id: string) {
  return summaryByPresentationId.has(id);
}

export function clinicianMarketPresentationData(id: string): PresentationRuntimeData | undefined {
  const summary = summaryByPresentationId.get(id);
  if (!summary) return undefined;
  const products = summary.productIds.map((productId) => productById.get(productId)).filter((item): item is MarketProduct => Boolean(item));
  if (!products.length) return undefined;
  const genericCodes = new Set(products.map((product) => product.generic.genericRegistryCode).filter((value): value is string => Boolean(value)));
  const uniqueGenericCode = genericCodes.size === 1 ? [...genericCodes][0] : undefined;
  const priceSummary = summary.priceSummary;
  const priceRange: MedicationPriceRange | undefined = priceSummary && priceSummary.comparable
    ? {
        minToman: priceSummary.minToman,
        medianToman: priceSummary.medianToman,
        maxToman: priceSummary.maxToman,
        productCount: priceSummary.pricedProductCount ?? priceSummary.productCount,
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
    sourceObservedAt: products.map((product) => product.market.observedAt).filter((value): value is string => Boolean(value)).sort().at(-1),
    sourceUrl: products[0]?.market.nfiUrl ?? "https://irc.fda.gov.ir/nfi",
  };
}

export function clinicianGenericDisplayPriceRange(genericName: string): MedicationPriceRange | undefined {
  if (!marketIndex) return undefined;
  const key = normalizedTerms(genericName);
  const summaries = marketIndex.presentationSummaries.filter((summary) => normalizedTerms(summary.genericCanonicalName) === key);
  const prices = summaries.flatMap((summary) =>
    summary.productIds
      .map((productId) => productById.get(productId)?.price?.amountToman)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
  ).sort((left, right) => left - right);
  if (!prices.length) return undefined;
  const middle = Math.floor(prices.length / 2);
  const medianToman = prices.length % 2 ? prices[middle]! : Math.round((prices[middle - 1]! + prices[middle]!) / 2);
  const singleComparablePresentation = summaries.length === 1 && summaries[0]?.priceSummary?.comparable === true;
  return {
    minToman: prices[0]!,
    medianToman,
    maxToman: prices[prices.length - 1]!,
    productCount: prices.length,
    basis: singleComparablePresentation ? "nfi_comparable_products" : "nfi_generic_market_range",
    costComparable: singleComparablePresentation,
    presentationCount: summaries.length,
  };
}
