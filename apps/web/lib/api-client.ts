import { buildType2Assessment, buildType2MedicationConsiderations } from "@glymize/clinical-engine";
import type {
  AdminNotification,
  CreateAdminNotificationInput,
  CatalogImportRequest,
  DrugDataUpdateRun,
  GenericMedication,
  GenericMedicationInput,
  GuidelineUpdateCheckResult,
  InsuranceCoverage,
  MasterDrugRegistryEntry,
  MedicationAdministrationRoute,
  MedicationBrand,
  MedicationChecklistItem,
  MedicationClinicalDomain,
  MedicationMarketData,
  MedicationMarketDataInput,
  MedicationPriceRange,
  MedicationTherapyGroup,
  NormalizedDrugImportBundle,
  NormalizedDrugImportRecord,
  ReferenceMedicationPresentation,
  Type2AssessmentResult,
  Type2ConsiderationRequest
} from "@glymize/contracts";
import { ada2026Type2GenericSeed, type2ProtocolSeed } from "../../api/src/catalog/ada-2026-type2-seed";
import { globalReferenceCatalogue, globalReferenceCatalogueSources } from "../../api/src/catalog/global-reference-catalog";
import { guidelineSources } from "../../api/src/guidelines/guideline-sources";
import {
  createBrowserCatalogStateStore,
  type BrowserCatalogState,
  type MasterDrugCandidate,
  type NormalizedDrugImportBundleWithMasterCandidates,
} from "./catalog/browser-catalog-state";
import {
  clinicianGenericDisplayPriceRange,
  clinicianMarketPresentationData,
  clinicianMarketPresentations,
  isClinicianMarketPresentation,
} from "./clinician-market-v2";

const remoteApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export type {
  BrowserCatalogState,
  MasterDrugCandidate,
} from "./catalog/browser-catalog-state";

let genericListCache: GenericMedication[] | null = null;
let medicationChecklistCache: MedicationChecklistItem[] | null = null;
let medicationChecklistById = new Map<string, MedicationChecklistItem>();
let medicationReferencesByGenericKey = new Map<
  string,
  MedicationChecklistItem[]
>();

function invalidateDerivedCatalogCaches() {
  genericListCache = null;
  medicationChecklistCache = null;
  medicationChecklistById = new Map();
  medicationReferencesByGenericKey = new Map();
}

const catalogStateStore = createBrowserCatalogStateStore(
  invalidateDerivedCatalogCaches,
);
const ensureState = catalogStateStore.ensure;
const readState = catalogStateStore.read;
const saveState = catalogStateStore.save;

export function beginCatalogPublishBatch() {
  catalogStateStore.beginPublishBatch();
}

export function endCatalogPublishBatch() {
  catalogStateStore.endPublishBatch();
}

export async function buildCatalogDiagnosticSnapshot() {
  await ensureState();
  const items = listMedicationChecklist();
  const records = items.map((item) => {
    const qualityFlags: string[] = [];
    if (item.marketVerification === "not_verified") qualityFlags.push("NOT_IN_CURRENT_NFI");
    if (item.marketVerification === "admin_override") qualityFlags.push("ADMIN_MARKET_OVERRIDE");
    if (!item.price && !item.priceRange) qualityFlags.push("PRICE_MISSING");
    if (item.insuranceCoverages.some((coverage) =>
      coverage.percent > 0 &&
      coverage.patientShareToman === undefined &&
      coverage.insurerShareToman === undefined &&
      coverage.referencePriceToman === undefined
    )) qualityFlags.push("INSURANCE_PERCENT_WITHOUT_REFERENCE_TARIFF");
    if (item.insuranceCoverages.some((coverage) => !Number.isInteger(coverage.percent))) qualityFlags.push("SOURCE_PERCENT_HAS_DECIMALS");
    return { ...item, qualityFlags };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "GLYMIZE published/browser medication catalogue",
    summary: {
      presentations: records.length,
      visibleToClinicians: records.filter((item) => item.showInApp).length,
      nfiVerified: records.filter((item) => item.marketVerification === "nfi_verified").length,
      adminOverrides: records.filter((item) => item.marketVerification === "admin_override").length,
      notVerified: records.filter((item) => item.marketVerification === "not_verified").length,
      withPrice: records.filter((item) => item.price || item.priceRange).length,
      withInsurance: records.filter((item) => item.insuranceCoverages.length > 0).length
    },
    records
  };
}

function masterGenericKey(value: string) {
  const terms = normalizedTerms(value).sort();
  return terms.length ? terms.join("|") : normalizedName(value);
}

function inferAdministrationRouteFromMaster(entry: MasterDrugRegistryEntry, therapyGroup: MedicationTherapyGroup): MedicationAdministrationRoute {
  if (therapyGroup === "oral_glucose_lowering" || therapyGroup === "lipid_lowering" || therapyGroup === "antiplatelet" || therapyGroup === "anticoagulant" || therapyGroup === "antianginal" || therapyGroup === "antiarrhythmic" || therapyGroup === "raas_blocker" || therapyGroup === "mineralocorticoid_receptor_antagonist" || therapyGroup === "antihypertensive" || therapyGroup === "liver_directed_therapy" || therapyGroup === "weight_management" || therapyGroup === "vitamin_or_mineral") return "oral";
  if (["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin", "fixed_ratio_combination"].includes(therapyGroup)) return "subcutaneous";
  const text = normalizedName(`${entry.canonicalName} ${entry.drugClass ?? ""} ${(entry.primaryIndications ?? []).join(" ")}`);
  if (/ophthalm|eye|retina/.test(text)) return "ophthalmic";
  if (/topical|cream|ointment|wound dressing/.test(text)) return "topical";
  if (/inhal/.test(text)) return "inhaled";
  if (/intraven| infusion|epoetin|iron sucrose|ferric/.test(text)) return "intravenous";
  return "other";
}

function isType2EngineEligible(entry: MasterDrugRegistryEntry, therapyGroup: MedicationTherapyGroup) {
  if (entry.reviewState !== "approved" || !entry.sourceCodes.length) return false;
  const allowedGroups: MedicationTherapyGroup[] = [
    "oral_glucose_lowering", "glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist",
    "human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin", "fixed_ratio_combination"
  ];
  const explicitlyHandledNonGlycemic = normalizedName(entry.canonicalName).includes("resmetirom");
  if (!allowedGroups.includes(therapyGroup) && !explicitlyHandledNonGlycemic) return false;
  const text = normalizedName(`${entry.therapeuticAreas.join(" ")} ${entry.diabetesOrPhenotype ?? ""} ${(entry.primaryIndications ?? []).join(" ")} ${entry.guidelineRole ?? ""}`);
  if (/stage 2 t1d|delay onset.*type 1|type 1 diabetes prevention/.test(text)) return false;
  if (explicitlyHandledNonGlycemic) return entry.sourceCodes.some((code) => /EASL|EMA|ADA/i.test(code));
  return /diabetes|t2d|type 2|hyperglyc|glucose/.test(text);
}

function masterToGenericMedication(entry: MasterDrugRegistryEntry): GenericMedication {
  const seeded = ada2026Type2GenericSeed.find((item) => masterGenericKey(item.canonicalName) === masterGenericKey(entry.canonicalName));
  const therapyGroup = seeded?.therapyGroup ?? inferTherapyGroup(entry);
  const administrationRoute = seeded?.administrationRoute ?? inferAdministrationRouteFromMaster(entry, therapyGroup);
  return {
    id: seeded?.id ?? `master-${entry.id.toLocaleLowerCase()}`,
    canonicalName: entry.canonicalName,
    persianName: entry.persianName?.trim() || entry.canonicalName,
    className: entry.drugClass ?? seeded?.className,
    therapyGroup,
    administrationRoute,
    catalogStatus: seeded?.catalogStatus ?? "admin_added",
    clinicalEngineEnabled: seeded ? true : isType2EngineEligible(entry, therapyGroup),
    masterRegistryId: entry.id
  };
}

function listGenerics() {
  if (genericListCache) return genericListCache;

  const state = readState();
  const merged = new Map<string, GenericMedication>();
  for (const medication of ada2026Type2GenericSeed) {
    merged.set(masterGenericKey(medication.canonicalName), medication);
  }
  for (const entry of state.masterRegistry.filter(
    (item) => item.reviewState === "approved",
  )) {
    merged.set(
      masterGenericKey(entry.canonicalName),
      masterToGenericMedication(entry),
    );
  }
  for (const medication of state.customGenerics) {
    const key = masterGenericKey(medication.canonicalName);
    const current = merged.get(key);
    merged.set(
      key,
      current
        ? {
            ...current,
            ...medication,
            id: current.id,
            masterRegistryId:
              current.masterRegistryId ?? medication.masterRegistryId,
          }
        : medication,
    );
  }

  genericListCache = [...merged.values()];
  return genericListCache;
}

function presentationMatchesMaster(presentation: ReferenceMedicationPresentation, entry: MasterDrugRegistryEntry) {
  return masterGenericKey(presentation.genericName) === masterGenericKey(entry.canonicalName);
}

function findMasterForPresentation(presentation: ReferenceMedicationPresentation, registry: MasterDrugRegistryEntry[]) {
  if (presentation.id.startsWith("master-ref-")) {
    const id = presentation.id.slice("master-ref-".length).toUpperCase();
    const direct = registry.find((entry) => entry.id.toUpperCase() === id);
    if (direct) return direct;
  }
  return registry.find((entry) => entry.reviewState === "approved" && presentationMatchesMaster(presentation, entry));
}

function masterReferencePresentations(
  state: BrowserCatalogState,
  basePresentations: ReferenceMedicationPresentation[],
): ReferenceMedicationPresentation[] {
  const baseGenericKeys = new Set(
    basePresentations.map((presentation) =>
      masterGenericKey(presentation.genericName),
    ),
  );

  return state.masterRegistry
    .filter((entry) => entry.reviewState === "approved")
    .filter(
      (entry) =>
        !baseGenericKeys.has(masterGenericKey(entry.canonicalName)),
    )
    .map((entry) => {
      const therapyGroup = inferTherapyGroup(entry);
      return {
        id: `master-ref-${entry.id.toLocaleLowerCase()}`,
        therapeuticClass: entry.drugClass ?? "Clinical catalog",
        mechanismOrSubclass:
          entry.guidelineRole ?? "WorldDrug clinical knowledge",
        genericName: entry.canonicalName,
        administrationRoute: inferAdministrationRouteFromMaster(
          entry,
          therapyGroup,
        ),
        dosageForm: "Clinical catalog · فرم بازار در انتظار NFI",
        strengthPresentation:
          "قدرت/فرآورده در انتظار تطبیق NFI",
        indicationScope: entry.primaryIndications?.join("؛ "),
        marketStatus:
          "Clinical catalog — Iran market product pending",
        sourceUrl: entry.sourceUrls[0] ?? "about:blank",
        coverageNotes:
          "هویت و نقش علمی از WorldDrug؛ برند/فرآورده و وضعیت بازار ایران باید با NFI تکمیل شود.",
        sourceFile: entry.sourceFile ?? "WorldDrug.xlsx",
        sourceObservedAt:
          entry.sourceObservedAt ?? new Date().toISOString(),
        reviewState: "reference_only",
      } satisfies ReferenceMedicationPresentation;
    });
}

function isNfiSourceUrl(value?: string) {
  return /irc\.fda\.gov\.ir\/nfi/i.test(value ?? "");
}

function nfiPriceRange(brands: MedicationBrand[]): MedicationPriceRange | undefined {
  const values = brands
    .filter((brand) => brand.sourceDiscovered && !brand.hiddenFromSource && isNfiSourceUrl(brand.sourceUrl))
    .map((brand) => brand.price?.amountToman)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (!values.length) return undefined;
  const middle = Math.floor(values.length / 2);
  const medianToman = values.length % 2
    ? values[middle]!
    : Math.round((values[middle - 1]! + values[middle]!) / 2);
  return {
    minToman: values[0]!,
    medianToman,
    maxToman: values[values.length - 1]!,
    productCount: values.length,
    basis: "nfi_comparable_products"
  };
}

function listMedicationChecklist(): MedicationChecklistItem[] {
  if (medicationChecklistCache) return medicationChecklistCache;

  const state = readState();
  const basePresentations = [
    ...clinicianMarketPresentations(),
    ...globalReferenceCatalogue,
    ...state.customPresentations,
  ];
  const presentations = [
    ...basePresentations,
    ...masterReferencePresentations(state, basePresentations),
  ];

  const masterById = new Map(
    state.masterRegistry.map((entry) => [
      entry.id.toUpperCase(),
      entry,
    ]),
  );
  const approvedMasterByGenericKey = new Map(
    state.masterRegistry
      .filter((entry) => entry.reviewState === "approved")
      .map((entry) => [
        masterGenericKey(entry.canonicalName),
        entry,
      ]),
  );

  const items = presentations.map((presentation) => {
    const market = state.marketData[presentation.id] ?? {};
    const masterId = presentation.id.startsWith("master-ref-")
      ? presentation.id.slice("master-ref-".length).toUpperCase()
      : undefined;
    const master =
      (masterId ? masterById.get(masterId) : undefined) ??
      approvedMasterByGenericKey.get(
        masterGenericKey(presentation.genericName),
      );

    const runtimeMarket =
      clinicianMarketPresentationData(presentation.id);
    const brands =
      runtimeMarket?.brands ??
      state.brands[presentation.id] ??
      [];
    const nfiVerified =
      Boolean(runtimeMarket) ||
      presentation.reviewState === "validated_for_iran" ||
      isNfiSourceUrl(market.sourceUrl) ||
      brands.some(
        (brand) =>
          brand.sourceDiscovered &&
          !brand.hiddenFromSource &&
          isNfiSourceUrl(brand.sourceUrl),
      );
    const adminOverride = Boolean(
      state.marketOverrides[presentation.id]?.approved,
    );
    const marketVerification = nfiVerified
      ? ("nfi_verified" as const)
      : adminOverride
        ? ("admin_override" as const)
        : ("not_verified" as const);
    const showInApp =
      state.visibility[presentation.id] === false
        ? false
        : marketVerification !== "not_verified";
    const priceRange =
      runtimeMarket?.priceRange ?? nfiPriceRange(brands);
    const marketBadge =
      market.marketBadge ??
      (marketVerification === "admin_override"
        ? {
            key: "admin-market-override",
            labelFa: "تأیید دستی ادمین · خارج از NFI فعلی",
            labelEn: "Admin-approved · outside current NFI",
            tone: "neutral" as const,
            confirmedByAdmin: true,
          }
        : master && presentation.reviewState === "reference_only"
          ? {
              key: "clinical-catalog",
              labelFa:
                "Clinical Catalog · وضعیت بازار در انتظار NFI",
              labelEn:
                "Clinical Catalog · Iran market pending",
              tone: "neutral" as const,
              confirmedByAdmin: false,
            }
          : undefined);

    return {
      referencePresentationId: presentation.id,
      genericName: presentation.genericName,
      therapeuticClass: presentation.therapeuticClass,
      administrationRoute: presentation.administrationRoute,
      dosageForm: presentation.dosageForm,
      strengthPresentation: presentation.strengthPresentation,
      sourceUrl:
        runtimeMarket?.sourceUrl ??
        market.sourceUrl ??
        presentation.sourceUrl,
      reviewState: presentation.reviewState,
      showInApp,
      insuranceCoverages:
        runtimeMarket?.insuranceCoverages ??
        state.insurance[presentation.id] ??
        [],
      brands,
      displayMode:
        market.displayMode ?? "generic_or_primary_brand",
      clinicalDomains:
        market.clinicalDomains ??
        clinicalDomainsFromMaster(master),
      clinicalEffects:
        market.clinicalEffects ?? master?.clinicalEffects,
      genericRegistryCode:
        runtimeMarket?.genericRegistryCode ??
        market.genericRegistryCode,
      price: market.price,
      priceRange,
      marketBadge:
        runtimeMarket?.marketBadge ?? marketBadge,
      sourceObservedAt:
        runtimeMarket?.sourceObservedAt ??
        market.sourceObservedAt ??
        master?.sourceObservedAt,
      marketVerification,
    } satisfies MedicationChecklistItem;
  });

  medicationChecklistCache = items;
  medicationChecklistById = new Map(
    items.map((item) => [
      item.referencePresentationId,
      item,
    ]),
  );
  medicationReferencesByGenericKey = new Map();
  for (const item of items) {
    const key = masterGenericKey(item.genericName);
    const current = medicationReferencesByGenericKey.get(key);
    if (current) current.push(item);
    else medicationReferencesByGenericKey.set(key, [item]);
  }

  return items;
}

function checklistItem(referencePresentationId: string) {
  listMedicationChecklist();
  return medicationChecklistById.get(referencePresentationId);
}

function normalizedTerms(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((term) => term.length >= 5);
}

function matchingReferences(medication: GenericMedication) {
  listMedicationChecklist();
  const medicationKey = masterGenericKey(
    medication.canonicalName,
  );
  return (
    medicationReferencesByGenericKey.get(medicationKey) ?? []
  );
}

function listClinicianGenerics() {
  return listGenerics().filter((medication) =>
    matchingReferences(medication).some(
      (item) => item.showInApp,
    ),
  );
}

function mergeInsuranceCoverages(coverages: InsuranceCoverage[]): InsuranceCoverage[] {
  return Object.values(coverages.reduce<Partial<Record<InsuranceCoverage["provider"], InsuranceCoverage>>>((result, coverage) => {
    if (!result[coverage.provider] || result[coverage.provider]!.percent < coverage.percent) result[coverage.provider] = coverage;
    return result;
  }, {}));
}

function coverageSourceChanged(manual: InsuranceCoverage, source?: InsuranceCoverage) {
  if (!source) return false;
  return manual.percent !== source.percent ||
    manual.genericCode !== source.genericCode ||
    manual.brandCode !== source.brandCode ||
    manual.insurerShareToman !== source.insurerShareToman ||
    manual.patientShareToman !== source.patientShareToman ||
    manual.referencePriceToman !== source.referencePriceToman;
}

function resolveMedicationDisplays(medication: GenericMedication) {
  const references = matchingReferences(medication).filter((item) => item.showInApp);
  const genericCoverage = references.flatMap((item) => item.insuranceCoverages);
  const brands = references.flatMap((reference, referenceIndex) =>
    reference.brands.map((brand) => ({
      brand,
      referenceIndex,
      inheritedCoverage: reference.insuranceCoverages
    }))
  )
    .filter(({ brand }) => brand.showInsteadOfGeneric && !brand.hiddenFromSource && brand.name.trim())
    .sort((left, right) => left.referenceIndex - right.referenceIndex || left.brand.priority - right.brand.priority);
  const primaryReference = references.find((item) => isClinicianMarketPresentation(item.referencePresentationId)) ??
    references.find((item) => item.marketVerification === "nfi_verified") ??
    references[0];
  const displayMode = primaryReference?.displayMode ?? "generic_or_primary_brand";
  if (!brands.length || displayMode === "generic_with_selected_brands") {
    return [{
      cardId: `${medication.id}:generic`,
      displayName: medication.persianName,
      selectedBrandName: undefined,
      selectedBrandId: undefined,
      selectedBrands: displayMode === "generic_with_selected_brands" ? brands.map(({ brand, inheritedCoverage }) => ({ ...brand, insuranceCoverages: brand.customInsurance ? brand.insuranceCoverages : inheritedCoverage })) : undefined,
      brandPriority: 0,
      insuranceCoverages: mergeInsuranceCoverages(genericCoverage),
      genericRegistryCode: primaryReference?.genericRegistryCode,
      price: primaryReference?.price,
      priceRange: clinicianGenericDisplayPriceRange(primaryReference?.genericName ?? medication.canonicalName) ?? primaryReference?.priceRange,
      marketBadge: primaryReference?.marketBadge
    }];
  }
  return brands.slice(0, 1).map(({ brand, inheritedCoverage }, index) => ({
    cardId: `${medication.id}:${brand.id}`,
    displayName: brand.name.trim(),
    selectedBrandName: brand.name.trim(),
    selectedBrandId: brand.id,
    brandPriority: index + 1,
    insuranceCoverages: mergeInsuranceCoverages(brand.customInsurance ? brand.insuranceCoverages : inheritedCoverage),
    genericRegistryCode: brand.genericRegistryCode ?? primaryReference?.genericRegistryCode,
    brandRegistryCode: brand.brandRegistryCode,
    price: brand.price ?? primaryReference?.price,
    priceRange: undefined,
    marketBadge: brand.marketBadge ?? primaryReference?.marketBadge
  }));
}

function type2Assessment(request: Type2ConsiderationRequest): Type2AssessmentResult {
  const visible = listClinicianGenerics()
    .filter((medication) => medication.catalogStatus !== "admin_added" || medication.clinicalEngineEnabled === true);
  const presentations = Object.fromEntries(visible.map((medication) => [medication.id, resolveMedicationDisplays(medication)]));
  const insuranceCoverageByMedicationId = Object.fromEntries(visible.map((medication) => [
    medication.id,
    mergeInsuranceCoverages(presentations[medication.id]!.flatMap((presentation) => presentation.insuranceCoverages))
  ]));
  const assessment = buildType2Assessment(visible, { ...request, insuranceCoverageByMedicationId });
  return {
    ...assessment,
    medications: assessment.medications.flatMap((medication) =>
      (presentations[medication.genericMedicationId] ?? [{
        cardId: `${medication.genericMedicationId}:generic`,
        displayName: medication.persianName,
        insuranceCoverages: [],
        brandPriority: 0
      }])
        .filter((presentation) => request.costPreference !== "insured_only" || presentation.insuranceCoverages.length > 0)
        .map((presentation) => ({ ...medication, ...presentation }))
    )
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function requestBody(init?: RequestInit) {
  if (!init?.body) return {};
  try {
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function updateVisibility(referencePresentationId: string, showInApp: boolean) {
  const current = checklistItem(referencePresentationId);
  if (!current) return undefined;
  const state = readState();
  state.visibility = { ...state.visibility, [referencePresentationId]: showInApp };
  const marketOverrides = { ...state.marketOverrides };
  if (showInApp && current.marketVerification === "not_verified") {
    marketOverrides[referencePresentationId] = { approved: true, approvedAt: new Date().toISOString() };
  } else if (!showInApp && current.marketVerification === "admin_override") {
    delete marketOverrides[referencePresentationId];
  }
  state.marketOverrides = marketOverrides;
  saveState(state);
  return checklistItem(referencePresentationId);
}

function updateInsurance(referencePresentationId: string, body: Record<string, unknown>) {
  if (!checklistItem(referencePresentationId)) return undefined;
  const state = readState();
  if (!body.enabled) {
    const next = { ...state.insurance };
    delete next[referencePresentationId];
    state.insurance = next;
  } else {
    const provider = body.provider as InsuranceCoverage["provider"];
    const percent = Number(body.percent);
    if (!provider || !Number.isFinite(percent) || percent < 0 || percent > 100) return undefined;
    const optionalAmount = (key: string) => body[key] === undefined || body[key] === "" ? undefined : Number(body[key]);
    const insurerShareToman = optionalAmount("insurerShareToman");
    const patientShareToman = optionalAmount("patientShareToman");
    const referencePriceToman = optionalAmount("referencePriceToman");
    if ([insurerShareToman, patientShareToman, referencePriceToman].some((amount) => amount !== undefined && (!Number.isFinite(amount) || amount < 0))) return undefined;
    const current = state.insurance[referencePresentationId] ?? [];
    state.insurance = {
      ...state.insurance,
      [referencePresentationId]: [...current.filter((item) => item.provider !== provider), {
        provider,
        percent,
        origin: "manual",
        genericCode: String(body.genericCode ?? "").trim() || undefined,
        insurerShareToman,
        patientShareToman,
        referencePriceToman
      }]
    };
  }
  saveState(state);
  return checklistItem(referencePresentationId);
}

function updateMarketData(referencePresentationId: string, body: MedicationMarketDataInput) {
  if (!checklistItem(referencePresentationId)) return undefined;
  const state = readState();
  state.marketData = {
    ...state.marketData,
    [referencePresentationId]: {
      ...(state.marketData[referencePresentationId] ?? {}),
      ...body,
      updatedAt: new Date().toISOString()
    }
  };
  saveState(state);
  return checklistItem(referencePresentationId);
}

function addNotification(notification: Omit<AdminNotification, "id" | "createdAt" | "status">) {
  const state = readState();
  const duplicate = state.notifications.find((item) =>
    item.status !== "resolved" && item.title === notification.title && item.entityReferenceId === notification.entityReferenceId
  );
  if (duplicate) return duplicate;
  const created: AdminNotification = {
    ...notification,
    id: crypto.randomUUID(),
    status: "unread",
    createdAt: new Date().toISOString()
  };
  state.notifications = [created, ...state.notifications].slice(0, 200);
  return created;
}

function updateNotification(notificationId: string, status: AdminNotification["status"]) {
  const state = readState();
  if (!state.notifications.some((item) => item.id === notificationId)) return undefined;
  state.notifications = state.notifications.map((item) => item.id === notificationId ? { ...item, status } : item);
  saveState(state, false);
  return state.notifications.find((item) => item.id === notificationId);
}

function createNotification(body: CreateAdminNotificationInput) {
  if (!["info", "warning", "error"].includes(body.severity) || !String(body.title ?? "").trim() || !String(body.message ?? "").trim()) return undefined;
  const created = addNotification({
    ...body,
    title: String(body.title).trim(),
    message: String(body.message).trim()
  });
  saveState(readState(), false);
  return created;
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase("fa")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/[^a-z0-9آ-ی]+/gi, " ")
    .replace(/\s+/g, " ");
}

function masterCandidateKey(candidate: MasterDrugCandidate) {
  const irc = String(candidate.brandRegistryCode ?? "").trim();
  if (irc) return `irc:${irc}`;
  return [
    "label",
    normalizedName(candidate.genericName),
    normalizedName(candidate.brandName ?? ""),
    normalizedName(candidate.dosageForm ?? ""),
    normalizedName(candidate.strengthPresentation ?? "")
  ].join(":");
}

function mergeMasterCandidates(current: MasterDrugCandidate[], incoming: MasterDrugCandidate[]) {
  const merged = new Map<string, MasterDrugCandidate>();
  for (const candidate of current) merged.set(masterCandidateKey(candidate), candidate);
  for (const candidate of incoming) merged.set(masterCandidateKey(candidate), candidate);
  return [...merged.values()];
}

function masterEntryMatchesCandidate(entry: MasterDrugRegistryEntry, candidate: MasterDrugCandidate) {
  const candidateName = normalizedName(candidate.genericName);
  const names = [entry.canonicalName, ...(entry.searchSynonyms ?? [])].map(normalizedName).filter(Boolean);
  return names.some((name) => name === candidateName || (candidateName.length >= 7 && (name.startsWith(candidateName) || candidateName.startsWith(name))));
}

function inferAdministrationRoute(candidate: MasterDrugCandidate): MedicationAdministrationRoute {
  const text = normalizedName(`${candidate.dosageForm ?? ""} ${candidate.genericName}`);
  if (/tablet|capsule|syrup|solution oral|قرص|کپسول|شربت/.test(text)) return "oral";
  if (/ophthalm|eye|چشم/.test(text)) return "ophthalmic";
  if (/topical|cream|ointment|gel|موضع/.test(text)) return "topical";
  if (/inhal|استنشاق/.test(text)) return "inhaled";
  if (/nasal|بینی/.test(text)) return "intranasal";
  if (/inject|pen|vial|insulin|تزریق/.test(text)) return "subcutaneous";
  return "other";
}

function inferTherapyGroup(entry: MasterDrugRegistryEntry | undefined): MedicationTherapyGroup {
  const text = normalizedName(`${entry?.drugClass ?? ""} ${(entry?.therapeuticAreas ?? []).join(" ")} ${entry?.canonicalName ?? ""} ${entry?.guidelineRole ?? ""}`);
  if ((/insulin/.test(text) && /glp 1|glp1/.test(text)) || /fixed ratio|frc/.test(text)) return "fixed_ratio_combination";
  if (/dual gip.*glp|gip.*glp|tirzepatide/.test(text)) return "dual_gip_glp_1_receptor_agonist";
  if (/glp 1|glp1/.test(text)) return "glp_1_receptor_agonist";
  if (/insulin/.test(text)) {
    if (/premix|pre mix|mix/.test(text)) return "premixed_insulin";
    if (/prandial|rapid|short|aspart|lispro|glulisine|regular/.test(text)) return "prandial_insulin_analog";
    if (/basal|glargine|degludec|detemir|nph/.test(text)) return "basal_insulin_analog";
    return "human_insulin";
  }
  if (/mineralocorticoid|mra|finerenone|spironolactone|eplerenone/.test(text)) return "mineralocorticoid_receptor_antagonist";
  if (/raas|ace inhibitor|angiotensin|arb/.test(text)) return "raas_blocker";
  if (/heart failure/.test(text)) return "heart_failure_therapy";
  if (/antiplatelet|aspirin|clopidogrel|ticagrelor/.test(text)) return "antiplatelet";
  if (/anticoag|apixaban|rivaroxaban|warfarin/.test(text)) return "anticoagulant";
  if (/antianginal/.test(text)) return "antianginal";
  if (/antiarrhythmic/.test(text)) return "antiarrhythmic";
  if (/hypertension|antihypertensive|calcium channel blocker|beta blocker/.test(text)) return "antihypertensive";
  if (/statin|pcsk9|ezetimibe|lipid lowering|hyperlipid/.test(text)) return "lipid_lowering";
  if (/resmetirom|liver directed|mash|masld/.test(text) && !/diabetes/.test(text)) return "liver_directed_therapy";
  if (/obesity|weight management|anti obesity/.test(text) && !/diabetes/.test(text)) return "weight_management";
  if (/vitamin|mineral|iron replacement/.test(text)) return "vitamin_or_mineral";
  if (/biguanide|dpp 4|sglt2|sulfonyl|meglitinide|glinide|thiazolidinedione|alpha glucosidase|dopamine d2|bile acid sequestrant|diabetes|glucose lowering|hyperglyc/.test(text)) return "oral_glucose_lowering";
  return "other";
}

function clinicalDomainsFromMaster(entry: MasterDrugRegistryEntry | undefined): MedicationClinicalDomain[] {
  if (!entry) return [];
  const text = normalizedName(`${entry.therapeuticAreas.join(" ")} ${entry.drugClass ?? ""} ${(entry.primaryIndications ?? []).join(" ")} ${entry.diabetesOrPhenotype ?? ""}`);
  const domains = new Set<MedicationClinicalDomain>();
  if (/diabetes|glucose|hyperglyc|t1d|t2d/.test(text)) domains.add("diabetes");
  if (/cardio|cvd|coronary|stroke|ascvd/.test(text)) domains.add("cardiovascular");
  if (/kidney|ckd|renal|dialysis/.test(text)) domains.add("kidney");
  if (/liver|hepatic|mash|masld|cirrhos/.test(text)) domains.add("liver");
  if (/obesity|weight/.test(text)) domains.add("obesity");
  if (/hypertension|blood pressure/.test(text)) domains.add("hypertension");
  if (/lipid|ldl|cholesterol|triglycer/.test(text)) domains.add("lipids");
  if (/heart failure|hfref|hfpef/.test(text)) domains.add("heart_failure");
  if (/ascvd|atheroscler/.test(text)) domains.add("ascvd");
  if (/mash|masld/.test(text)) domains.add("masld_mash");
  if (/neuropath/.test(text)) domains.add("neuropathy");
  if (/retinopath|macular/.test(text)) domains.add("retinopathy");
  if (/diabetic foot|foot ulcer|wound/.test(text)) domains.add("diabetic_foot");
  if (/nutrition|protein energy|malnutrition/.test(text)) domains.add("nutrition_support");
  if (/pregnan|gestational/.test(text)) domains.add("pregnancy");
  for (const effect of entry.clinicalEffects) {
    if (["neutral", "not_established"].includes(effect.direction)) continue;
    if (effect.domain === "glycemic_control") domains.add("diabetes");
    if (effect.domain === "ascvd") { domains.add("ascvd"); domains.add("cardiovascular"); }
    if (effect.domain === "heart_failure") { domains.add("heart_failure"); domains.add("cardiovascular"); }
    if (effect.domain === "ckd") domains.add("kidney");
    if (effect.domain === "weight") domains.add("obesity");
    if (effect.domain === "masld_mash") { domains.add("masld_mash"); domains.add("liver"); }
    if (effect.domain === "hypertension") domains.add("hypertension");
    if (effect.domain === "lipids") domains.add("lipids");
    if (effect.domain === "retinopathy") domains.add("retinopathy");
    if (effect.domain === "neuropathy") domains.add("neuropathy");
    if (effect.domain === "diabetic_foot") domains.add("diabetic_foot");
  }
  return [...domains];
}

function presentationIdForCandidate(candidate: MasterDrugCandidate) {
  const registry = String(candidate.brandRegistryCode ?? candidate.genericRegistryCode ?? "").replace(/[^a-zA-Z0-9]+/g, "-");
  const label = normalizedName(`${candidate.genericName}-${candidate.dosageForm ?? ""}-${candidate.strengthPresentation ?? ""}`)
    .replace(/[^a-z0-9آ-ی]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `iran-master-${registry || label || crypto.randomUUID()}`;
}

function promoteMasterCandidateInState(
  state: BrowserCatalogState,
  candidate: MasterDrugCandidate,
  input: Partial<{
    persianName: string;
    className: string;
    therapyGroup: MedicationTherapyGroup;
    administrationRoute: MedicationAdministrationRoute;
    clinicalDomains: MedicationClinicalDomain[];
  }> = {}
) {
  const master = state.masterRegistry.find((entry) => entry.reviewState === "approved" && masterEntryMatchesCandidate(entry, candidate));
  const canonicalName = master?.canonicalName ?? candidate.genericName;
  const persianName = input.persianName?.trim() || master?.persianName?.trim() || candidate.genericName;
  const className = input.className?.trim() || master?.drugClass?.trim() || "Needs clinical classification";
  const therapyGroup = input.therapyGroup ?? inferTherapyGroup(master);
  const administrationRoute = input.administrationRoute ?? inferAdministrationRoute(candidate);
  const clinicalDomains = input.clinicalDomains?.length ? input.clinicalDomains : clinicalDomainsFromMaster(master);
  const existingGeneric = [...ada2026Type2GenericSeed, ...state.customGenerics].find((item) => normalizedName(item.canonicalName) === normalizedName(canonicalName));
  const id = existingGeneric?.id ?? `master-${canonicalName.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID()}`;
  if (!existingGeneric) {
    state.customGenerics = [...state.customGenerics, {
      id,
      canonicalName,
      persianName,
      className,
      therapyGroup,
      administrationRoute,
      catalogStatus: "admin_added",
      clinicalEngineEnabled: false,
      masterRegistryId: master?.id
    }];
  }

  let referencePresentationId = state.customPresentations.find((item) =>
    normalizedName(item.genericName).includes(normalizedName(candidate.genericName)) &&
    normalizedName(item.dosageForm) === normalizedName(candidate.dosageForm ?? "") &&
    normalizedName(item.strengthPresentation) === normalizedName(candidate.strengthPresentation ?? "")
  )?.id;
  if (!referencePresentationId) {
    referencePresentationId = presentationIdForCandidate(candidate);
    state.customPresentations = [...state.customPresentations, {
      id: referencePresentationId,
      therapeuticClass: className,
      mechanismOrSubclass: master?.guidelineRole ?? "Master Registry classified",
      genericName: `${candidate.genericName}${persianName && normalizedName(persianName) !== normalizedName(candidate.genericName) ? ` / ${persianName}` : ""}`,
      administrationRoute,
      dosageForm: candidate.dosageForm ?? "نامشخص",
      strengthPresentation: candidate.strengthPresentation ?? "نامشخص",
      indicationScope: master?.primaryIndications?.join("؛ "),
      marketStatus: "Iran NFI verified",
      sourceUrl: candidate.sourceUrl,
      coverageNotes: "Market identity verified from Iran NFI; clinical-engine activation remains separate.",
      sourceFile: "Iran FDA NFI / Master Registry",
      sourceObservedAt: candidate.observedAt,
      reviewState: "validated_for_iran"
    }];
  }

  state.visibility[referencePresentationId] = true;
  state.insurance[referencePresentationId] = candidate.insuranceCoverages ?? [];
  state.marketData[referencePresentationId] = {
    ...(state.marketData[referencePresentationId] ?? {}),
    genericRegistryCode: candidate.genericRegistryCode,
    clinicalDomains,
    price: candidate.price,
    sourceUrl: candidate.sourceUrl,
    sourceObservedAt: candidate.observedAt,
    updatedAt: new Date().toISOString()
  };
  if (candidate.brandName) {
    const current = state.brands[referencePresentationId] ?? [];
    const existing = current.find((brand) => normalizedName(brand.name) === normalizedName(candidate.brandName!));
    const brand: MedicationBrand = {
      id: existing?.id ?? `source-${candidate.brandRegistryCode ?? crypto.randomUUID()}`,
      name: candidate.brandName,
      showInsteadOfGeneric: existing?.showInsteadOfGeneric ?? false,
      priority: existing?.priority ?? current.length + 1,
      customInsurance: existing?.customInsurance ?? false,
      insuranceCoverages: candidate.insuranceCoverages ?? [],
      genericRegistryCode: candidate.genericRegistryCode,
      brandRegistryCode: candidate.brandRegistryCode,
      price: candidate.price,
      sourceDiscovered: true,
      sourceUrl: candidate.sourceUrl,
      sourceObservedAt: candidate.observedAt,
      hiddenFromSource: false
    };
    state.brands[referencePresentationId] = existing ? current.map((item) => item.id === existing.id ? brand : item) : [...current, brand];
  }
  return { referencePresentationId, genericMedicationId: id, matchedMasterRegistryId: master?.id };
}

function promoteMatchingMasterCandidates(state: BrowserCatalogState) {
  const promotable = state.masterCandidates.filter((candidate) => state.masterRegistry.some((entry) => entry.reviewState === "approved" && masterEntryMatchesCandidate(entry, candidate)));
  for (const candidate of promotable) promoteMasterCandidateInState(state, candidate);
  const keys = new Set(promotable.map(masterCandidateKey));
  state.masterCandidates = state.masterCandidates.filter((candidate) => !keys.has(masterCandidateKey(candidate)));
  return promotable.length;
}

function importMasterRegistry(entries: MasterDrugRegistryEntry[]) {
  const state = readState();
  const merged = new Map(state.masterRegistry.map((entry) => [entry.id, entry]));
  for (const entry of entries) merged.set(entry.id, { ...entry, reviewState: "approved" });
  state.masterRegistry = [...merged.values()];
  const autoPromoted = promoteMatchingMasterCandidates(state);
  saveState(state);
  const recognizedGenerics = listGenerics();
  const checklistItems = listMedicationChecklist();
  return {
    imported: entries.length,
    total: state.masterRegistry.length,
    autoPromoted,
    recognizedGenerics: recognizedGenerics.length,
    checklistItems: checklistItems.length,
    engineEnabled: recognizedGenerics.filter((item) => item.clinicalEngineEnabled === true || item.catalogStatus === "seeded_from_guideline").length
  };
}

function promoteMasterCandidate(candidateKey: string, body: Record<string, unknown>) {
  const state = readState();
  const candidate = state.masterCandidates.find((item) => masterCandidateKey(item) === candidateKey);
  if (!candidate) return undefined;
  const result = promoteMasterCandidateInState(state, candidate, {
    persianName: String(body.persianName ?? "").trim() || undefined,
    className: String(body.className ?? "").trim() || undefined,
    therapyGroup: body.therapyGroup as MedicationTherapyGroup | undefined,
    administrationRoute: body.administrationRoute as MedicationAdministrationRoute | undefined,
    clinicalDomains: Array.isArray(body.clinicalDomains) ? body.clinicalDomains as MedicationClinicalDomain[] : undefined
  });
  state.masterCandidates = state.masterCandidates.filter((item) => masterCandidateKey(item) !== candidateKey);
  saveState(state);
  return result;
}

function validateNormalizedBundle(bundle: NormalizedDrugImportBundle | null | undefined) {
  const errors: string[] = [];
  if (!bundle || typeof bundle !== "object" || bundle.schemaVersion !== 1 || bundle.run?.schemaVersion !== 1 || !Array.isArray(bundle.run?.sources) || !bundle.run?.summary || !Array.isArray(bundle.records)) {
    errors.push("نسخه یا ساختار بستهٔ استخراج معتبر نیست.");
    return errors;
  }
  const mandatorySources = ["iran_fda_nfi", "health_insurance", "armed_forces", "social_security"];
  for (const sourceId of mandatorySources) {
    const source = bundle.run.sources.find((item) => item.sourceId === sourceId);
    if (!source || source.status !== "succeeded") errors.push(`منبع ${sourceId} کامل دریافت نشده است.`);
  }
  const providers = ["social_security", "health_insurance", "armed_forces", "other_organizations", "supplementary"];
  const validToman = (amount: unknown) => amount === undefined || (typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0);
  if (bundle.records.some((record) => {
    if (!record || typeof record !== "object" || !record.genericName || !record.sourceUrl || !record.observedAt || !Array.isArray(record.insuranceCoverages)) return true;
    if (record.price && (!validToman(record.price.amountToman) || !["consumer_retail", "insurance_reference", "unknown"].includes(record.price.priceKind))) return true;
    return record.insuranceCoverages.some((coverage) =>
      !coverage || !providers.includes(coverage.provider) || !Number.isFinite(coverage.percent) || coverage.percent < 0 || coverage.percent > 100 ||
      !validToman(coverage.insurerShareToman) || !validToman(coverage.patientShareToman) || !validToman(coverage.referencePriceToman)
    );
  })) {
    errors.push("حداقل یک رکورد، نام/منبع/قیمت یا اطلاعات بیمهٔ معتبر ندارد.");
  }
  const masterCandidates = (bundle as NormalizedDrugImportBundleWithMasterCandidates).masterCandidates;
  if (masterCandidates !== undefined && (!Array.isArray(masterCandidates) || masterCandidates.some((candidate) =>
    !candidate ||
    typeof candidate !== "object" ||
    !candidate.genericName ||
    !candidate.sourceUrl ||
    !candidate.observedAt ||
    candidate.identityDisposition !== "preserved_for_master_registry" ||
    !["needs_domain_classification", "classified"].includes(candidate.classificationStatus)
  ))) {
    errors.push("حداقل یک رکورد Master Drug Registry ساختار معتبر ندارد.");
  }
  return errors;
}

function genericImportCandidates(record: NormalizedDrugImportRecord, checklist: MedicationChecklistItem[]) {
  if (record.referencePresentationId) return checklist.filter((item) => item.referencePresentationId === record.referencePresentationId);
  return checklist.filter((item) =>
    item.genericName.split("/").some((part) => normalizedName(part) === normalizedName(record.genericName)) ||
    normalizedName(item.genericName) === normalizedName(record.genericName)
  );
}

function matchingImportCandidates(record: NormalizedDrugImportRecord, checklist: MedicationChecklistItem[]) {
  let candidates = genericImportCandidates(record, checklist);
  if (candidates.length > 1 && record.dosageForm) {
    const form = normalizedName(record.dosageForm);
    const narrowed = candidates.filter((item) => {
      const candidate = normalizedName(item.dosageForm);
      return candidate === form || candidate.includes(form) || form.includes(candidate);
    });
    if (narrowed.length) candidates = narrowed;
  }
  if (candidates.length > 1 && record.strengthPresentation) {
    const strength = normalizedName(record.strengthPresentation);
    const narrowed = candidates.filter((item) => {
      const candidate = normalizedName(item.strengthPresentation);
      return candidate === strength || candidate.includes(strength) || strength.includes(candidate);
    });
    if (narrowed.length) candidates = narrowed;
  }
  return candidates;
}

function applyNormalizedBundle(bundle: NormalizedDrugImportBundle) {
  const state = readState();
  const errors = validateNormalizedBundle(bundle);
  const bundleWithMasterCandidates = bundle as NormalizedDrugImportBundleWithMasterCandidates;
  if (!bundle?.run || !Array.isArray(bundle.run.sources) || !bundle.run.summary) {
    addNotification({
      severity: "error",
      title: "فایل به‌روزرسانی معتبر نیست",
      message: errors[0] ?? "ساختار بستهٔ استخراج ناقص است.",
      actionHref: "/admin/data-updates",
      actionLabel: "بررسی فایل"
    });
    saveState(state, false);
    return { applied: false, errors, matched: 0, ambiguous: 0, masterCandidatesStored: 0 };
  }
  state.updateRuns = [bundle.run, ...state.updateRuns.filter((run) => run.id !== bundle.run.id)].slice(0, 24);
  if (errors.length) {
    for (const message of errors) addNotification({
      severity: "error",
      title: "به‌روزرسانی دارویی منتشر نشد",
      message,
      actionHref: "/admin/data-updates",
      actionLabel: "بررسی اجرای ناموفق",
      sourceRunId: bundle.run.id
    });
    const failedRun: DrugDataUpdateRun = { ...bundle.run, status: "failed", summary: { ...bundle.run.summary, errorCount: Math.max(bundle.run.summary.errorCount, errors.length) } };
    state.updateRuns = [
      failedRun,
      ...state.updateRuns.filter((run) => run.id !== bundle.run.id)
    ].slice(0, 24);
    saveState(state, false);
    return { applied: false, errors, matched: 0, ambiguous: 0, masterCandidatesStored: 0 };
  }

  const checklist = listMedicationChecklist();
  const ambiguousRecords = bundle.records.filter((record) => {
    const candidates = matchingImportCandidates(record, checklist);
    return candidates.length !== 1 || (!record.referencePresentationId && record.matchConfidence !== undefined && record.matchConfidence < 0.9);
  });
  if (ambiguousRecords.length) {
    for (const record of ambiguousRecords.slice(0, 50)) addNotification({
      severity: "warning",
      title: "تطبیق دارویی نیازمند بازبینی است",
      message: `رکورد «${record.genericName}${record.brandName ? ` / ${record.brandName}` : ""}» به‌صورت یکتا تطبیق داده نشد.`,
      actionHref: "/admin/data-updates#ambiguous-matches",
      actionLabel: "بازبینی تطبیق",
      sourceRunId: bundle.run.id
    });
    const needsReviewRun: DrugDataUpdateRun = {
      ...bundle.run,
      status: "needs_review",
      summary: { ...bundle.run.summary, ambiguousMatchCount: ambiguousRecords.length }
    };
    state.updateRuns = [needsReviewRun, ...state.updateRuns.filter((run) => run.id !== bundle.run.id)].slice(0, 24);
    saveState(state, false);
    return {
      applied: false,
      errors: [`${ambiguousRecords.length} رکورد مبهم است؛ نسخهٔ سالم قبلی فعال ماند.`],
      matched: 0,
      ambiguous: ambiguousRecords.length,
      masterCandidatesStored: 0
    };
  }
  let matched = 0;
  let ambiguous = 0;
  for (const record of bundle.records) {
    const candidates = matchingImportCandidates(record, checklist);
    if (candidates.length !== 1) continue;
    const item = candidates[0]!;
    const existingMarket = state.marketData[item.referencePresentationId] ?? {};
    if (!record.brandName) {
      const incomingPrice = record.price;
      const existingPrice = existingMarket.price;
      const sourcePriceChanged = Boolean(incomingPrice && existingPrice && incomingPrice.amountToman !== existingPrice.amountToman);
      const price = incomingPrice ? {
        ...incomingPrice,
        manualOverrideToman: existingPrice?.manualOverrideToman,
        manualOverrideUpdatedAt: existingPrice?.manualOverrideUpdatedAt,
        manualOverrideNeedsReview: sourcePriceChanged && existingPrice?.manualOverrideToman !== undefined
      } : existingPrice;
      if (price?.manualOverrideNeedsReview) addNotification({
        severity: "warning",
        title: "اصلاح دستی قیمت نیازمند بازبینی است",
        message: `قیمت منبع برای «${item.genericName}» تغییر کرده، اما قیمت دستی قبلی حفظ شده است.`,
        actionHref: `/admin/medications#${item.referencePresentationId}`,
        actionLabel: "بررسی قیمت",
        sourceRunId: bundle.run.id,
        entityReferenceId: item.referencePresentationId
      });
      state.marketData[item.referencePresentationId] = {
        ...existingMarket,
        genericRegistryCode: record.genericRegistryCode ?? existingMarket.genericRegistryCode,
        clinicalDomains: record.clinicalDomains ?? existingMarket.clinicalDomains ?? ["diabetes"],
        price,
        sourceUrl: record.sourceUrl,
        sourceObservedAt: record.observedAt,
        updatedAt: new Date().toISOString()
      };
      const previousCoverages = state.insurance[item.referencePresentationId] ?? [];
      const manualCoverages = previousCoverages.filter((coverage) => coverage.origin === "manual");
      const incomingSourceCoverages = record.insuranceCoverages.map((coverage) => ({ ...coverage, origin: "source" as const }));
      const sourceCoverages = [
        ...previousCoverages.filter((coverage) => coverage.origin !== "manual" && !incomingSourceCoverages.some((incoming) => incoming.provider === coverage.provider)),
        ...incomingSourceCoverages
      ];
      state.insurance[item.referencePresentationId] = [
        ...sourceCoverages.filter((sourceCoverage) => !manualCoverages.some((manual) => manual.provider === sourceCoverage.provider)),
        ...manualCoverages.map((manual) => {
          const source = sourceCoverages.find((entry) => entry.provider === manual.provider);
          const manualOverrideNeedsReview = coverageSourceChanged(manual, source);
          if (manualOverrideNeedsReview) addNotification({
            severity: "warning",
            title: "اصلاح دستی بیمه نیازمند بازبینی است",
            message: `اطلاعات منبع برای «${item.genericName}» تغییر کرده، اما مقادیر دستی بیمه حفظ شده است.`,
            actionHref: `/admin/medications#${item.referencePresentationId}`,
            actionLabel: "بررسی پوشش بیمه",
            sourceRunId: bundle.run.id,
            entityReferenceId: item.referencePresentationId
          });
          return { ...manual, manualOverrideNeedsReview };
        })
      ];
    } else {
      const currentBrands = state.brands[item.referencePresentationId] ?? [];
      const existingBrand = currentBrands.find((brand) => normalizedName(brand.name) === normalizedName(record.brandName!));
      const incomingBrandCoverages = record.insuranceCoverages.map((coverage) => ({ ...coverage, origin: "source" as const }));
      const mergedBrandSourceCoverages = [
        ...(existingBrand?.insuranceCoverages ?? []).filter((coverage) => coverage.origin !== "source" || !incomingBrandCoverages.some((incoming) => incoming.provider === coverage.provider)),
        ...incomingBrandCoverages
      ];
      const reviewedCustomCoverages = (existingBrand?.insuranceCoverages ?? []).map((manual) => {
        const source = incomingBrandCoverages.find((coverage) => coverage.provider === manual.provider);
        const manualOverrideNeedsReview = coverageSourceChanged(manual, source);
        if (manualOverrideNeedsReview) addNotification({
          severity: "warning",
          title: "اصلاح دستی بیمه برند نیازمند بازبینی است",
          message: `اطلاعات منبع برای برند «${record.brandName}» تغییر کرده، اما مقادیر دستی بیمه حفظ شده است.`,
          actionHref: `/admin/medications#${item.referencePresentationId}`,
          actionLabel: "بررسی بیمه برند",
          sourceRunId: bundle.run.id,
          entityReferenceId: item.referencePresentationId
        });
        return { ...manual, manualOverrideNeedsReview };
      });
      const brandPrice = existingBrand?.price?.manualOverrideToman !== undefined && record.price
        ? { ...record.price, manualOverrideToman: existingBrand.price.manualOverrideToman, manualOverrideUpdatedAt: existingBrand.price.manualOverrideUpdatedAt, manualOverrideNeedsReview: record.price.amountToman !== existingBrand.price.amountToman }
        : record.price ?? existingBrand?.price;
      if (brandPrice?.manualOverrideNeedsReview) addNotification({
        severity: "warning",
        title: "اصلاح دستی قیمت برند نیازمند بازبینی است",
        message: `قیمت منبع برای برند «${record.brandName}» تغییر کرده، اما قیمت دستی حفظ شده است.`,
        actionHref: `/admin/medications#${item.referencePresentationId}`,
        actionLabel: "بررسی قیمت برند",
        sourceRunId: bundle.run.id,
        entityReferenceId: item.referencePresentationId
      });
      const brand: MedicationBrand = {
        id: existingBrand?.id ?? crypto.randomUUID(),
        name: record.brandName,
        showInsteadOfGeneric: existingBrand?.showInsteadOfGeneric ?? false,
        priority: existingBrand?.priority ?? currentBrands.length + 1,
        customInsurance: existingBrand?.customInsurance ?? false,
        insuranceCoverages: existingBrand?.customInsurance
          ? reviewedCustomCoverages
          : mergedBrandSourceCoverages,
        genericRegistryCode: record.genericRegistryCode ?? existingBrand?.genericRegistryCode,
        brandRegistryCode: record.brandRegistryCode ?? existingBrand?.brandRegistryCode,
        price: brandPrice,
        sourceDiscovered: true,
        sourceUrl: record.sourceUrl,
        sourceObservedAt: record.observedAt,
        hiddenFromSource: existingBrand?.hiddenFromSource ?? false,
        marketBadge: existingBrand?.marketBadge
      };
      state.brands[item.referencePresentationId] = existingBrand
        ? currentBrands.map((entry) => entry.id === existingBrand.id ? brand : entry)
        : [...currentBrands, brand];
    }
    matched += 1;
  }
  const incomingMasterCandidates = Array.isArray(bundleWithMasterCandidates.masterCandidates)
    ? bundleWithMasterCandidates.masterCandidates
    : [];
  state.masterCandidates = mergeMasterCandidates(state.masterCandidates, incomingMasterCandidates);
  const autoPromoted = promoteMatchingMasterCandidates(state);
  if (autoPromoted) addNotification({ severity: "info", title: "داروهای جدید از Master Registry طبقه‌بندی شدند", message: `${autoPromoted} رکورد NFI با Clinical Catalog تأییدشده تطبیق یافت و بدون فعال‌سازی خودکار موتور وارد فهرست دارو شد.`, actionHref: "/admin/medications", actionLabel: "مشاهده داروها", sourceRunId: bundle.run.id });
  const completedRun: DrugDataUpdateRun = {
    ...bundle.run,
    status: "ready_to_publish",
    summary: { ...bundle.run.summary, ambiguousMatchCount: ambiguous }
  };
  state.updateRuns = [completedRun, ...state.updateRuns.filter((run) => run.id !== bundle.run.id)].slice(0, 24);
  saveState(state);
  return { applied: true, errors: [], matched, ambiguous, masterCandidatesStored: state.masterCandidates.length, autoPromoted };
}

function addBrand(referencePresentationId: string, body: Record<string, unknown>) {
  if (!checklistItem(referencePresentationId)) return undefined;
  const state = readState();
  const current = state.brands[referencePresentationId] ?? [];
  const name = String(body.name ?? "").trim();
  const brand: MedicationBrand = {
    id: crypto.randomUUID(),
    name,
    showInsteadOfGeneric: false,
    priority: current.length + 1,
    customInsurance: false,
    insuranceCoverages: []
  };
  state.brands = { ...state.brands, [referencePresentationId]: [...current, brand] };
  saveState(state);
  return checklistItem(referencePresentationId);
}

function updateBrand(referencePresentationId: string, brandId: string, body: Record<string, unknown>) {
  const state = readState();
  const current = state.brands[referencePresentationId] ?? [];
  if (!current.some((brand) => brand.id === brandId)) return undefined;
  state.brands = {
    ...state.brands,
    [referencePresentationId]: current.map((brand) => brand.id === brandId ? { ...brand, ...body } as MedicationBrand : brand)
  };
  saveState(state);
  return checklistItem(referencePresentationId);
}

function removeBrand(referencePresentationId: string, brandId: string) {
  const state = readState();
  const current = state.brands[referencePresentationId] ?? [];
  if (!current.some((brand) => brand.id === brandId)) return undefined;
  const remaining = current.filter((brand) => brand.id !== brandId).map((brand, index) => ({ ...brand, priority: index + 1 }));
  const next = { ...state.brands };
  if (remaining.length) next[referencePresentationId] = remaining;
  else delete next[referencePresentationId];
  state.brands = next;
  saveState(state);
  return checklistItem(referencePresentationId);
}

function addGeneric(body: GenericMedicationInput) {
  const state = readState();
  const canonicalName = String(body.canonicalName ?? "").trim();
  const existing = listGenerics().find((medication) => medication.canonicalName.toLocaleLowerCase() === canonicalName.toLocaleLowerCase());
  if (existing) return existing;
  if (!canonicalName || !body.persianName || !body.className || !body.therapyGroup || !body.administrationRoute) return undefined;
  const id = canonicalName.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const medication: GenericMedication = { ...body, id, canonicalName, catalogStatus: "admin_added", clinicalEngineEnabled: false };
  state.customGenerics = [...state.customGenerics, medication];
  saveState(state);
  return medication;
}

async function browserApiFetch(path: string, init?: RequestInit): Promise<Response> {
  await ensureState();
  const method = (init?.method ?? "GET").toUpperCase();
  const pathname = path.split("?")[0]!;
  const body = requestBody(init);

  if (method === "GET" && pathname === "/v1/catalog/generics") return json(listClinicianGenerics());
  if (method === "GET" && pathname === "/v1/protocols/type-2") return json(type2ProtocolSeed);
  if (method === "GET" && pathname === "/v1/admin/guidelines") return json(guidelineSources);
  if (method === "GET" && pathname === "/v1/admin/catalog/medication-checklist") return json(listMedicationChecklist());
  if (method === "GET" && pathname === "/v1/admin/catalog/reference-sources") return json(globalReferenceCatalogueSources);
  if (method === "GET" && pathname === "/v1/admin/catalog/master-candidates") return json(readState().masterCandidates.map((candidate) => ({ ...candidate, candidateKey: masterCandidateKey(candidate) })));
  if (method === "GET" && pathname === "/v1/admin/catalog/master-registry") return json(readState().masterRegistry);
  if (method === "POST" && pathname === "/v1/admin/catalog/master-registry/import") {
    const entries = Array.isArray(body.entries) ? body.entries as MasterDrugRegistryEntry[] : [];
    if (!entries.length || entries.some((entry) => !entry?.id || !entry?.canonicalName || !Array.isArray(entry.sourceCodes) || !Array.isArray(entry.sourceUrls))) return json({ message: "WorldDrug Clinical Catalog معتبر نیست." }, 422);
    return json(importMasterRegistry(entries));
  }
  const masterPromoteMatch = pathname.match(/^\/v1\/admin\/catalog\/master-candidates\/(.+)\/promote$/);
  if (method === "POST" && masterPromoteMatch) {
    const result = promoteMasterCandidate(decodeURIComponent(masterPromoteMatch[1]!), body);
    return result ? json(result) : json({ message: "رکورد Master Candidate پیدا نشد." }, 404);
  }
  if (method === "GET" && pathname === "/v1/admin/notifications") return json(readState().notifications);
  if (method === "POST" && pathname === "/v1/admin/notifications") {
    const created = createNotification(body as unknown as CreateAdminNotificationInput);
    return created ? json(created, 201) : json({ message: "اطلاعات اعلان معتبر نیست." }, 400);
  }
  if (method === "GET" && pathname === "/v1/admin/catalog/update-runs") return json(readState().updateRuns);
  if (method === "POST" && pathname === "/v1/admin/catalog/normalized-imports/preview") {
    const bundle = body as unknown as NormalizedDrugImportBundle | null;
    const errors = validateNormalizedBundle(bundle);
    const checklist = listMedicationChecklist();
    const records = Array.isArray(bundle?.records) ? bundle.records : [];
    const ambiguous = errors.length ? 0 : records.filter((record) => {
      const matches = matchingImportCandidates(record, checklist);
      return matches.length !== 1 || (!record.referencePresentationId && record.matchConfidence !== undefined && record.matchConfidence < 0.9);
    }).length;
    const ambiguousRecords = errors.length ? [] : records.flatMap((record, recordIndex) => {
      const matches = matchingImportCandidates(record, checklist);
      const isAmbiguous = matches.length !== 1 || (!record.referencePresentationId && record.matchConfidence !== undefined && record.matchConfidence < 0.9);
      if (!isAmbiguous) return [];
      const suggestions = genericImportCandidates({ ...record, referencePresentationId: undefined }, checklist);
      return [{
        recordIndex,
        genericName: record.genericName,
        brandName: record.brandName,
        candidates: suggestions.map((item) => ({
          referencePresentationId: item.referencePresentationId,
          label: `${item.genericName} · ${item.dosageForm} · ${item.strengthPresentation}`
        }))
      }];
    });
    const masterCandidateCount = Array.isArray((bundle as NormalizedDrugImportBundleWithMasterCandidates | null)?.masterCandidates)
      ? (bundle as NormalizedDrugImportBundleWithMasterCandidates).masterCandidates!.length
      : 0;
    return json({
      valid: errors.length === 0,
      errors,
      recordCount: records.length,
      ambiguous,
      ambiguousRecords,
      masterCandidateCount,
      canApply: errors.length === 0 && ambiguous === 0
    }, errors.length ? 422 : 200);
  }
  if (method === "POST" && pathname === "/v1/admin/catalog/normalized-imports/apply") {
    const result = applyNormalizedBundle(body as unknown as NormalizedDrugImportBundle);
    return json(result, result.applied ? 200 : 422);
  }
  if (method === "GET" && pathname === "/v1/admin/preview/type-2-considerations") {
    return json(buildType2MedicationConsiderations(listGenerics(), {
      currentHba1c: 8,
      targetHba1c: 7,
      workflow: "initiation",
      factors: []
    }));
  }
  if (method === "POST" && pathname === "/v1/catalog/type-2/considerations") {
    return json(type2Assessment(body as unknown as Type2ConsiderationRequest));
  }
  if (method === "POST" && pathname === "/v1/admin/catalog/imports") {
    const request = body as unknown as CatalogImportRequest;
    return json({
      importId: crypto.randomUUID(),
      status: request.sourceKind !== "manual_csv" && !request.sourceUrl ? "blocked" : "queued",
      message: request.sourceKind !== "manual_csv" && !request.sourceUrl
        ? "برای Import باید URL یا فایل استاندارد ثبت شود."
        : "درخواست در همین مرورگر ثبت شد؛ برای ورود فایل Excel از صفحهٔ انتخاب داروها استفاده کنید."
    });
  }
  if (method === "POST" && pathname === "/v1/admin/catalog/generics") {
    const created = addGeneric(body as unknown as GenericMedicationInput);
    return created ? json(created) : json({ message: "فیلدهای الزامی ناقص است." }, 400);
  }
  const guidelineMatch = pathname.match(/^\/v1\/admin\/guidelines\/([^/]+)\/check$/);
  if (method === "POST" && guidelineMatch) {
    const sourceId = decodeURIComponent(guidelineMatch[1]!);
    const source = guidelineSources.find((item) => item.id === sourceId);
    const result: GuidelineUpdateCheckResult = source ? {
      sourceId,
      status: "queued_for_review",
      checkedAt: new Date().toISOString(),
      message: "بررسی نسخهٔ جدید ثبت شد؛ هیچ قاعده یا توصیه‌ای خودکار تغییر نکرده است."
    } : {
      sourceId,
      status: "blocked",
      checkedAt: new Date().toISOString(),
      message: "منبع guideline شناخته نشد."
    };
    return json(result, source ? 200 : 404);
  }

  const brandMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)\/brands\/([^/]+)$/);
  if (brandMatch) {
    const referencePresentationId = decodeURIComponent(brandMatch[1]!);
    const brandId = decodeURIComponent(brandMatch[2]!);
    const updated = method === "DELETE"
      ? removeBrand(referencePresentationId, brandId)
      : method === "PATCH"
        ? updateBrand(referencePresentationId, brandId, body)
        : undefined;
    return updated ? json(updated) : json({ message: "برند پیدا نشد." }, 404);
  }
  const marketDataMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)\/market-data$/);
  if (method === "PATCH" && marketDataMatch) {
    const referencePresentationId = decodeURIComponent(marketDataMatch[1]!);
    const updated = updateMarketData(referencePresentationId, body as MedicationMarketDataInput);
    return updated ? json(updated) : json({ message: "دارو پیدا نشد." }, 404);
  }
  const notificationMatch = pathname.match(/^\/v1\/admin\/notifications\/([^/]+)$/);
  if (method === "PATCH" && notificationMatch) {
    const notificationId = decodeURIComponent(notificationMatch[1]!);
    const status = body.status as AdminNotification["status"];
    if (!["unread", "read", "resolved"].includes(status)) return json({ message: "وضعیت اعلان معتبر نیست." }, 400);
    const updated = updateNotification(notificationId, status);
    return updated ? json(updated) : json({ message: "اعلان پیدا نشد." }, 404);
  }
  const addBrandMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)\/brands$/);
  if (method === "POST" && addBrandMatch) {
    const referencePresentationId = decodeURIComponent(addBrandMatch[1]!);
    const updated = addBrand(referencePresentationId, body);
    return updated ? json(updated) : json({ message: "دارو پیدا نشد." }, 404);
  }
  const insuranceMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)\/insurance$/);
  if (method === "PATCH" && insuranceMatch) {
    const referencePresentationId = decodeURIComponent(insuranceMatch[1]!);
    const updated = updateInsurance(referencePresentationId, body);
    return updated ? json(updated) : json({ message: "اطلاعات بیمه معتبر نیست." }, 400);
  }
  const visibilityMatch = pathname.match(/^\/v1\/admin\/catalog\/medication-checklist\/([^/]+)$/);
  if (method === "PATCH" && visibilityMatch) {
    const referencePresentationId = decodeURIComponent(visibilityMatch[1]!);
    const updated = updateVisibility(referencePresentationId, Boolean(body.showInApp));
    return updated ? json(updated) : json({ message: "دارو پیدا نشد." }, 404);
  }
  return json({ message: "مسیر محلی شناخته نشد." }, 404);
}

function isBrowserOwnedCatalogRoute(path: string) {
  const pathname = path.split("?")[0]!;
  return pathname.startsWith("/v1/catalog/") ||
    pathname.startsWith("/v1/admin/catalog/") ||
    pathname.startsWith("/v1/admin/notifications") ||
    pathname === "/v1/protocols/type-2" ||
    pathname.startsWith("/v1/admin/preview/type-2-considerations");
}

export function apiFetch(path: string, init?: RequestInit) {
  if (isBrowserOwnedCatalogRoute(path)) return browserApiFetch(path, init);
  return remoteApiUrl ? fetch(`${remoteApiUrl}${path}`, init) : browserApiFetch(path, init);
}
