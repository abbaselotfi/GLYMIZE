import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ market: vi.fn(), projection: vi.fn() }));
vi.mock("../lib/clinician-market-v2", () => ({ loadClinicianMarketV2: mocks.market }));
vi.mock("../lib/type2-decision-graph-market", () => ({ loadType2DecisionGraphMarketProducts: mocks.projection, cachedType2DecisionGraphMarketProducts: () => [] }));
vi.mock("../lib/admin-auth", () => ({ isAdminApiConfigured: () => false, getAdminSession: () => null, publishAdminCatalog: vi.fn() }));
import { createBrowserCatalogStateStore } from "../lib/catalog/browser-catalog-state";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("market recovery preserves local catalog edits", () => {
  it("retries failed market without refetching or replacing edited catalog", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() }, dispatchEvent: vi.fn() });
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.market.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(undefined);
    mocks.projection.mockResolvedValue([]);
    const store = createBrowserCatalogStateStore(vi.fn());
    await store.ensure();
    const edited = { ...store.read(), visibility: { retained: true } };
    store.save(edited, false);
    await Promise.all([store.ensure(), store.ensure()]);
    expect(store.read()).toBe(edited);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.market).toHaveBeenCalledTimes(2);
    await store.ensure();
    expect(mocks.market).toHaveBeenCalledTimes(2);
  });
});
