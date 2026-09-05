import { configureType2DecisionGraphRuntimeCatalog } from "@glymize/clinical-engine";
import type {
  AdminNotification,
  DrugDataUpdateRun,
  GenericMedication,
  InsuranceCoverage,
  MasterDrugRegistryEntry,
  MedicationBrand,
  MedicationMarketData,
  NormalizedDrugImportBundle,
  NormalizedDrugImportRecord,
  ReferenceMedicationPresentation,
} from "@glymize/contracts";
import { getAdminSession, isAdminApiConfigured, publishAdminCatalog } from "../admin-auth";
import { withBasePath } from "../base-path";
import { loadClinicianMarketV2 } from "../clinician-market-v2";
import {
  cachedType2DecisionGraphMarketProducts,
  loadType2DecisionGraphMarketProducts,
} from "../type2-decision-graph-market";

const storageKey = "glymize-browser-catalog-v2";

export interface MasterDrugCandidate extends NormalizedDrugImportRecord {
  originalGenericName?: string;
  classificationStatus: "needs_domain_classification" | "classified";
  identityDisposition: "preserved_for_master_registry";
  reviewReason?: string;
}

export type NormalizedDrugImportBundleWithMasterCandidates = NormalizedDrugImportBundle & {
  masterCandidates?: MasterDrugCandidate[];
};

export interface BrowserCatalogState {
  visibility: Record<string, boolean>;
  insurance: Record<string, InsuranceCoverage[]>;
  brands: Record<string, MedicationBrand[]>;
  customGenerics: GenericMedication[];
  marketData: Record<string, MedicationMarketData>;
  notifications: AdminNotification[];
  updateRuns: DrugDataUpdateRun[];
  masterCandidates: MasterDrugCandidate[];
  masterRegistry: MasterDrugRegistryEntry[];
  customPresentations: ReferenceMedicationPresentation[];
  marketOverrides: Record<string, { approved: boolean; approvedAt: string }>;
}

interface PublishedCatalogState extends BrowserCatalogState {
  schemaVersion: 1 | 2;
  revision: string;
  updatedAt: string;
  updatedBy: string;
}

function emptyState(): BrowserCatalogState {
  return {
    visibility: {},
    insurance: {},
    brands: {},
    customGenerics: [],
    marketData: {},
    notifications: [],
    updateRuns: [],
    masterCandidates: [],
    masterRegistry: [],
    customPresentations: [],
    marketOverrides: {},
  };
}

export function parseStoredCatalogState(value: string | null): {
  state: BrowserCatalogState;
  savedAt?: string;
} | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as {
      state?: Partial<BrowserCatalogState>;
      savedAt?: string;
    } & Partial<BrowserCatalogState>;
    const parsed = raw.state ?? raw;
    return {
      state: {
        ...emptyState(),
        ...parsed,
        marketData: parsed.marketData ?? {},
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        updateRuns: Array.isArray(parsed.updateRuns) ? parsed.updateRuns : [],
        masterCandidates: Array.isArray(parsed.masterCandidates) ? parsed.masterCandidates : [],
        masterRegistry: Array.isArray(parsed.masterRegistry) ? parsed.masterRegistry : [],
        customPresentations: Array.isArray(parsed.customPresentations)
          ? parsed.customPresentations
          : [],
        marketOverrides: parsed.marketOverrides ?? {},
      },
      savedAt: raw.savedAt,
    };
  } catch {
    return null;
  }
}

function notifyPublish(status: "pending" | "publishing" | "success" | "error", message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("glymize-publish-status", { detail: { status, message } }));
}

function configureDecisionGraph(state: BrowserCatalogState) {
  const marketProducts = cachedType2DecisionGraphMarketProducts();
  if (!state.masterRegistry.length || !marketProducts.length) return;
  configureType2DecisionGraphRuntimeCatalog({
    masterRegistry: state.masterRegistry,
    marketProducts,
  });
}

export function createBrowserCatalogStateStore(invalidateDerivedCaches: () => void) {
  let stateCache = emptyState();
  let stateLoaded = false;
  let statePromise: Promise<void> | null = null;
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  let publishBatchDepth = 0;
  let pendingPublishState: BrowserCatalogState | null = null;

  function read() {
    return stateCache;
  }

  function schedulePublish(state: BrowserCatalogState) {
    if (!isAdminApiConfigured() || !getAdminSession()) return;
    pendingPublishState = structuredClone(state);
    notifyPublish("pending", "تغییر ذخیره شد؛ در انتظار انتشار مرکزی…");
    if (publishBatchDepth > 0) return;
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = setTimeout(() => {
      publishTimer = null;
      const catalog = pendingPublishState;
      pendingPublishState = null;
      if (!catalog) return;
      notifyPublish("publishing", "در حال ثبت در GitHub و انتشار نسخهٔ جدید…");
      void publishAdminCatalog(catalog)
        .then((result) => {
          const current = read();
          const updateRuns = current.updateRuns.map((run) =>
            run.status === "ready_to_publish" ? { ...run, status: "published" as const } : run,
          );
          stateCache = { ...current, updateRuns };
          configureDecisionGraph(stateCache);
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({
              schemaVersion: 2,
              savedAt: new Date().toISOString(),
              state: stateCache,
            }),
          );
          window.dispatchEvent(new CustomEvent("glymize-catalog-change"));
          notifyPublish("success", `انتشار ثبت شد؛ نسخهٔ ${result.commitSha.slice(0, 7)} منتشر شد.`);
        })
        .catch(() =>
          notifyPublish(
            "error",
            "انتشار مرکزی ناموفق بود؛ دوباره وارد مدیریت شوید و تغییر را تکرار کنید.",
          ),
        );
    }, 700);
  }

  async function ensure() {
    if (stateLoaded || typeof window === "undefined") return;
    if (statePromise) return statePromise;
    statePromise = (async () => {
      try {
        await Promise.all([
          loadClinicianMarketV2(),
          loadType2DecisionGraphMarketProducts(),
        ]);
      } catch (error) {
        console.warn(
          "GLYMIZE clinician market v2 unavailable; retaining existing catalog only.",
          error,
        );
      }
      const localDraft = parseStoredCatalogState(window.localStorage.getItem(storageKey));
      try {
        const response = await fetch(
          `${withBasePath("/data/admin-catalog.json")}?t=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("published_catalog_unavailable");
        const published = (await response.json()) as PublishedCatalogState;
        const publishedState: BrowserCatalogState = {
          visibility: published.visibility ?? {},
          insurance: published.insurance ?? {},
          brands: published.brands ?? {},
          customGenerics: published.customGenerics ?? [],
          marketData: published.marketData ?? {},
          notifications: published.notifications ?? [],
          updateRuns: published.updateRuns ?? [],
          masterCandidates: Array.isArray(published.masterCandidates)
            ? published.masterCandidates
            : [],
          masterRegistry: Array.isArray(published.masterRegistry) ? published.masterRegistry : [],
          customPresentations: Array.isArray(published.customPresentations)
            ? published.customPresentations
            : [],
          marketOverrides: published.marketOverrides ?? {},
        };
        const localIsNewer = Boolean(
          localDraft?.savedAt && Date.parse(localDraft.savedAt) > Date.parse(published.updatedAt),
        );
        stateCache = localIsNewer ? localDraft!.state : publishedState;
      } catch {
        stateCache = localDraft?.state ?? emptyState();
      }
      configureDecisionGraph(stateCache);
      invalidateDerivedCaches();
      stateLoaded = true;
    })();
    return statePromise;
  }

  function save(state: BrowserCatalogState, publish = true) {
    stateCache = state;
    configureDecisionGraph(stateCache);
    invalidateDerivedCaches();
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ schemaVersion: 2, savedAt: new Date().toISOString(), state }),
    );
    window.dispatchEvent(new CustomEvent("glymize-catalog-change"));
    if (publish) schedulePublish(state);
  }

  function beginPublishBatch() {
    if (publishBatchDepth === 0 && publishTimer) {
      clearTimeout(publishTimer);
      publishTimer = null;
    }
    publishBatchDepth += 1;
  }

  function endPublishBatch() {
    publishBatchDepth = Math.max(0, publishBatchDepth - 1);
    if (publishBatchDepth === 0 && pendingPublishState) {
      schedulePublish(pendingPublishState);
    }
  }

  return { beginPublishBatch, endPublishBatch, ensure, read, save };
}
