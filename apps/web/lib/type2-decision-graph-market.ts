import type { InsuranceCoverage, IranMarketDrugProduct } from "@glymize/contracts";
import { withBasePath } from "./base-path";

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

function mapMarket(index: RawMarketIndex): IranMarketDrugProduct[] {
  const coverageByCode = insuranceByGenericCode(index.insuranceRecords ?? []);
  return (index.products ?? [])
    .filter((product) => product.market.nfiVerificationStatus === "verified")
    .filter((product) => product.product.availabilityStatus !== "unavailable")
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
        licenseStatus: product.product.licenseStatus ?? "Active",
        price: typeof amountToman === "number" && Number.isFinite(amountToman) && amountToman >= 0
          ? {
              amountToman,
              priceKind: "consumer_retail" as const,
              sourceAmount: typeof product.price?.rawAmount === "number" ? product.price.rawAmount : undefined,
              sourceCurrency,
              effectiveAt: product.price?.observedAt ?? product.market.observedAt ?? undefined,
              sourceUrl: product.market.nfiUrl ?? "https://irc.fda.gov.ir/nfi",
              sourceReference: product.productId,
            }
          : undefined,
        insuranceCoverages: genericCode ? coverageByCode.get(genericCode) ?? [] : [],
        sourceUrl: product.market.nfiUrl ?? "https://irc.fda.gov.ir/nfi",
        sourceReference: product.productId,
        observedAt: product.market.observedAt ?? new Date().toISOString(),
        matchConfidence: 100,
      } satisfies IranMarketDrugProduct;
    });
}

export function cachedType2DecisionGraphMarketProducts() {
  return cache ?? [];
}

export async function loadType2DecisionGraphMarketProducts() {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const response = await fetch(withBasePath("/data/glymize-clinician-market-v2.json"), { cache: "force-cache" });
    if (!response.ok) throw new Error(`decision_graph_market_unavailable:${response.status}`);
    const index = (await response.json()) as RawMarketIndex;
    if (index.schemaVersion !== 2 || index.kind !== "glymize_clinician_market_index") {
      throw new Error("decision_graph_market_schema_mismatch");
    }
    cache = mapMarket(index);
    return cache;
  })().finally(() => {
    loadPromise = undefined;
  });
  return loadPromise;
}
