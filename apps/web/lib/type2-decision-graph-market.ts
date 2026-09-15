import type { InsuranceCoverage, IranMarketDrugProduct } from "@glymize/contracts";
import { loadValidatedClinicianMarketIndex } from "./clinician-market-v2";
import { initializeTrustedType2ClaimPolicyRuntime } from "./type2-claim-policy-runtime";

type RawProduct = {
  productId: string;
  generic: {
    canonicalName: string;
    genericRegistryCode?: string | null;
  };
  product: {
    brandName?: string | null;
    brandRegistryCode?: string | null;
    ircCode?: string | null;
    gtin?: string | null;
    atcCode?: string | null;
    dosageFormNormalized?: string | null;
    route?: string | null;
    strengthRaw?: string | null;
    packageRaw?: string | null;
    unitsPerPackage?: number | null;
    unitType?: string | null;
    manufacturerName?: string | null;
    licenseStatus?: string | null;
    availabilityStatus?: string | null;
  };
  market: {
    nfiVerificationStatus: string;
    nfiUrl?: string | null;
    observedAt?: string | null;
  };
  price?: {
    amountToman?: number | null;
    rawAmount?: number | null;
    rawCurrency?: string | null;
    observedAt?: string | null;
  } | null;
};

type RawInsurance = {
  insuranceRecordId?: string | null;
  provider: InsuranceCoverage["provider"];
  genericCode?: string | null;
  rawPercent?: number | null;
  rawPercentKind?: string | null;
  rawPercentBasis?: string | null;
  normalizedInsurerCoveragePercent?: number | null;
  normalizedPatientSharePercent?: number | null;
  normalizedPercentDerived?: boolean | null;
  conditions?: string | null;
  observedAt?: string | null;
  sourceUrl?: string | null;
  match?: {
    status?: string | null;
    matchedGenericRegistryCode?: string | null;
    matchedProductId?: string | null;
  } | null;
};

type RawMarketIndex = {
  schemaVersion: 2;
  kind: "glymize_clinician_market_index";
  products: RawProduct[];
  insuranceRecords: RawInsurance[];
};

let cache: IranMarketDrugProduct[] | undefined;
let loadPromise: Promise<IranMarketDrugProduct[]> | undefined;

function insuranceByGenericCode(records: readonly RawInsurance[]) {
  const result = new Map<string, InsuranceCoverage[]>();
  for (const record of records) {
    const code = record.match?.matchedGenericRegistryCode ?? record.genericCode ?? undefined;
    if (!code || record.match?.status !== "matched" || record.match?.matchedProductId) continue;
    if (typeof record.normalizedInsurerCoveragePercent !== "number") continue;
    const coverage: InsuranceCoverage = {
      provider: record.provider,
      percent: record.normalizedInsurerCoveragePercent,
      origin: "source",
      genericCode: code,
      effectiveAt: record.observedAt ?? undefined,
      sourceUrl: record.sourceUrl ?? undefined,
      sourceReference: record.insuranceRecordId ?? undefined,
      sourcePercent: record.rawPercent ?? undefined,
      sourcePercentKind: record.rawPercentKind as InsuranceCoverage["sourcePercentKind"],
      sourcePercentBasis: record.rawPercentBasis as InsuranceCoverage["sourcePercentBasis"],
      normalizedPercentDerived: record.normalizedPercentDerived ?? undefined,
      sourcePatientSharePercent: record.normalizedPatientSharePercent ?? undefined,
      conditions: record.conditions ?? undefined,
      runtimeEligibleForRanking: !record.conditions,
    };
    result.set(code, [...(result.get(code) ?? []), coverage]);
  }
  return result;
}

function packagePresentation(product: RawProduct) {
  if (product.product.packageRaw?.trim()) return product.product.packageRaw;
  if (product.product.unitsPerPackage && product.product.unitType) {
    return `${product.product.unitsPerPackage} ${product.product.unitType}`;
  }
  return undefined;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validProductShape(value: unknown): value is RawProduct {
  if (!object(value) || typeof value.productId !== "string" || !value.productId.trim()
    || !object(value.generic) || typeof value.generic.canonicalName !== "string" || !value.generic.canonicalName.trim()
    || !object(value.product) || !object(value.market)) return false;
  const strings = (record: Record<string, unknown>, keys: string[]) => keys.every(
    (key) => record[key] == null || typeof record[key] === "string",
  );
  if (!strings(value.generic, ["genericRegistryCode"])
    || !strings(value.product, ["brandName", "brandRegistryCode", "ircCode", "gtin", "atcCode", "dosageFormNormalized", "route", "strengthRaw", "packageRaw", "unitType", "manufacturerName", "licenseStatus", "availabilityStatus"])
    || (value.product.unitsPerPackage != null && (typeof value.product.unitsPerPackage !== "number" || !Number.isFinite(value.product.unitsPerPackage)))) return false;
  return value.price == null || (object(value.price) && strings(value.price, ["rawCurrency", "observedAt"]));
}

function hasSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

// Source verification and downstream approved-master matching are different contracts.
// Counts are bounded categories, never raw source/patient payloads or per-row logs.
export function projectType2DecisionGraphMarket(index: RawMarketIndex) {
  const rejected = { malformed: 0, verification: 0, unavailable: 0, observation: 0, source: 0 };
  const accepted = (index.products ?? []).filter((product: unknown): product is RawProduct => {
    if (!validProductShape(product)) { rejected.malformed++; return false; }
    if (product.market.nfiVerificationStatus !== "nfi_verified") { rejected.verification++; return false; }
    if (product.product.availabilityStatus === "unavailable") { rejected.unavailable++; return false; }
    if (typeof product.market.observedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(product.market.observedAt)
      || !Number.isFinite(Date.parse(product.market.observedAt))) { rejected.observation++; return false; }
    if (!hasSourceUrl(product.market.nfiUrl)) { rejected.source++; return false; }
    return true;
  });
  return { products: mapMarket({ ...index, products: accepted }), rejected };
}

function mapMarket(index: RawMarketIndex): IranMarketDrugProduct[] {
  const coverageByCode = insuranceByGenericCode(index.insuranceRecords ?? []);
  return (index.products ?? [])
    .map((product) => {
      const genericCode = product.generic.genericRegistryCode ?? undefined;
      const amountToman = product.price?.amountToman;
      const sourceCurrency = product.price?.rawCurrency === "IRR" || product.price?.rawCurrency === "TOMAN"
        ? product.price.rawCurrency
        : undefined;
      return {
        id: product.productId,
        genericName: product.generic.canonicalName,
        genericRegistryCode: genericCode,
        brandName: product.product.brandName ?? undefined,
        brandRegistryCode: product.product.brandRegistryCode ?? undefined,
        ircCode: product.product.ircCode ?? undefined,
        gtin: product.product.gtin ?? undefined,
        atcCode: product.product.atcCode ?? undefined,
        dosageForm: product.product.dosageFormNormalized ?? undefined,
        strengthPresentation: product.product.strengthRaw ?? undefined,
        route: product.product.route ?? undefined,
        packagePresentation: packagePresentation(product),
        manufacturerName: product.product.manufacturerName ?? undefined,
        licenseStatus: product.product.licenseStatus ?? undefined,
        price: typeof amountToman === "number" && Number.isFinite(amountToman) && amountToman >= 0
          ? {
              amountToman,
              priceKind: "consumer_retail" as const,
              sourceAmount: typeof product.price?.rawAmount === "number" ? product.price.rawAmount : undefined,
              sourceCurrency,
              effectiveAt: product.price?.observedAt ?? product.market.observedAt ?? undefined,
              sourceUrl: product.market.nfiUrl!,
              sourceReference: product.productId,
            }
          : undefined,
        insuranceCoverages: genericCode ? coverageByCode.get(genericCode) ?? [] : [],
        sourceUrl: product.market.nfiUrl!,
        sourceReference: product.productId,
        observedAt: product.market.observedAt!,
        matchConfidence: 100,
      } satisfies IranMarketDrugProduct;
    });
}

export function cachedType2DecisionGraphMarketProducts() {
  return cache ?? [];
}

export async function loadType2DecisionGraphMarketProducts() {
  await initializeTrustedType2ClaimPolicyRuntime();
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const index = await loadValidatedClinicianMarketIndex();
    cache = projectType2DecisionGraphMarket(index).products;
    return cache;
  })().finally(() => {
    loadPromise = undefined;
  });
  return loadPromise;
}
