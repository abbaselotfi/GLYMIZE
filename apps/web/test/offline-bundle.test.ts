import { createHash, webcrypto } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const temporary: string[] = [];
afterEach(async () => {
  for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true });
});
const scriptUrl = new URL("../scripts/write-offline-bundle.mjs", import.meta.url).href;
const { writeOfflineBundle } = await import(scriptUrl);
const swSource = await readFile(
  new URL("../scripts/offline-sw-template.js", import.meta.url),
  "utf8",
);

async function exportedFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "glymize-offline-test-"));
  temporary.push(root);
  for (const file of [
    "index.html",
    "offline/index.html",
    "data/offline-reference.json",
    "type-2/index.html",
    "type-1/index.html",
    "pregnancy/index.html",
    "icon-192.png",
    "icon-512.png",
    "_next/static/a.js",
    "data/admin-catalog.json",
    "data/private.json",
    "admin/index.html",
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), file.endsWith(".json") ? "{}" : "public fixture");
  }
  await writeFile(path.join(root, "_headers"), "/custom\n  X-Existing: retained\n");
  return root;
}

function worker(version = "v1", badHash = false) {
  const origin = "https://app.test";
  const prefix = `glymize-offline:${origin}/:reference-lite:`;
  const payload = "public bundle";
  const hash = createHash("sha256").update(payload).digest("hex");
  const manifest = {
    schemaVersion: 1,
    profile: "reference-lite",
    version,
    basePath: "",
    assets: ["/", "/data/offline-reference.json"].map((path) => ({
      path,
      bytes: payload.length,
      sha256: badHash ? "bad" : hash,
      snapshot: `/_offline/${version}/${hash}`,
    })),
  };
  const storage = new Map<string, Map<string, Response>>();
  const match = vi.fn(async (name: string, key: URL) =>
    storage.get(name)?.get(String(key))?.clone(),
  );
  const caches = {
    keys: async () => [...storage.keys()],
    delete: async (name: string) => storage.delete(name),
    open: async (name: string) => {
      if (!storage.has(name)) storage.set(name, new Map());
      return {
        match: (key: URL) => match(name, key),
        put: async (key: URL, response: Response) => {
          storage.get(name)!.set(String(key), response.clone());
        },
      };
    },
  };
  type Event = {
    data?: { type: string };
    source?: { url: string };
    ports?: { postMessage: (value: unknown) => void }[];
    waitUntil?: (p: Promise<void>) => void;
    respondWith?: (p: Promise<Response>) => void;
    request?: { url: string; method: string; headers: Headers };
  };
  const handlers = new Map<string, (event: Event) => void>();
  const fetch = vi.fn(
    async () =>
      new Response(payload, {
        headers: { "content-type": "text/plain", "cache-control": "public, max-age=31536000" },
      }),
  );
  let time = 0;
  vm.runInNewContext(swSource.replace("/* OFFLINE_BUNDLE */ null", JSON.stringify(manifest)), {
    self: {
      registration: { scope: `${origin}/` },
      location: { origin },
      clients: { claim: vi.fn(async () => {}) },
      addEventListener: (name: string, fn: (e: Event) => void) => handlers.set(name, fn),
    },
    caches,
    fetch,
    URL,
    Request,
    Response,
    Headers,
    crypto: webcrypto,
    Date: { now: () => time },
  });
  const lifecycle = (name: string) => {
    let promise = Promise.resolve();
    handlers.get(name)!({
      waitUntil: (p) => {
        promise = p;
      },
    });
    return promise;
  };
  const request = (pathname: string, headers = new Headers(), method = "GET") => {
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: { url: `${origin}${pathname}`, method, headers },
      respondWith: (p) => {
        response = p;
      },
    });
    return response;
  };
  return {
    status: async () => {
      let result: unknown;
      let work = Promise.resolve();
      handlers.get("message")!({ data: { type: "REFERENCE_BUNDLE_STATUS" }, source: { url: `${origin}/offline/` },
        ports: [{ postMessage: (value) => { result = value; } }], waitUntil: (p) => { work = p; } });
      await work;
      return result;
    },
    storage,
    prefix,
    fetch,
    lifecycle,
    request,
    match,
    advance: () => {
      time += 300001;
    },
  };
}

describe("R29-02/R30-02 public offline bundle", () => {
  it("does not report an evicted partial bundle ready while offline", async () => {
    const w = worker();
    await w.lifecycle("install");
    expect(await w.status()).toEqual({ profile: "reference-lite", version: "v1" });
    w.storage.get(`${w.prefix}v1`)!.delete("https://app.test/data/offline-reference.json");
    w.fetch.mockRejectedValue(new Error("offline"));
    expect(await w.status()).toEqual({ error: "OFFLINE_REFERENCE_INCOMPLETE" });
  });
  it("generates deterministic versioned allowlists, preserves headers and changes version with content", async () => {
    const root = await exportedFixture();
    const manifest = await writeOfflineBundle(root, "/GLYMIZE");
    expect(manifest.profile).toBe("reference-lite");
    expect(manifest.assets.filter((a: { path: string }) => a.path.includes("/data/")).map((a: { path: string }) => a.path)).toEqual(["/GLYMIZE/data/offline-reference.json"]);
    expect(manifest.assets.some((a: { path: string }) => a.path === "/GLYMIZE/")).toBe(true);
    expect(manifest.assets.some((a: { path: string }) => /private|\/admin\//.test(a.path))).toBe(
      false,
    );
    expect((await writeOfflineBundle(root, "/GLYMIZE")).version).toBe(manifest.version);
    const headers = await readFile(path.join(root, "_headers"), "utf8");
    expect(headers).toContain("X-Existing: retained");
    expect(headers.match(/GLYMIZE_OFFLINE_BEGIN/g)).toHaveLength(1);
    expect(headers).not.toContain("/runtime-api");
    await writeFile(path.join(root, "_next/static/a.js"), "new public bundle");
    expect((await writeOfflineBundle(root, "/GLYMIZE")).version).not.toBe(manifest.version);
    await expect(writeOfflineBundle(root, "/../private")).rejects.toThrow(
      "OFFLINE_BASE_PATH_INVALID",
    );
  });

  it("serves installed public assets offline and expires bounded memory without a network fetch", async () => {
    const w = worker();
    await w.lifecycle("install");
    w.fetch.mockRejectedValue(new Error("offline"));
    expect(await (await w.request("/"))!.text()).toBe("public bundle");
    const matches = w.match.mock.calls.length;
    expect(await (await w.request("/"))!.text()).toBe("public bundle");
    expect(w.match.mock.calls.length).toBe(matches);
    w.advance();
    expect(await (await w.request("/"))!.text()).toBe("public bundle");
    expect(w.match.mock.calls.length).toBe(matches + 1);
    expect(await (await w.request("/data/offline-reference.json?t=123"))!.text()).toBe("public bundle");
    expect(w.fetch).toHaveBeenCalledTimes(2);
  });

  it("never intercepts private/authenticated/mutating/RSC traffic or arbitrary query keys", async () => {
    const w = worker();
    for (const pathname of [
      "/runtime-api/v1/patients/1",
      "/patients/?patientId=synthetic",
      "/patients/synthetic/",
      "/v1/session",
      "/admin/",
      "/?patient=1",
      "/data/admin-catalog.json?patient=1",
    ])
      expect(w.request(pathname)).toBeUndefined();
    expect(w.request("/", new Headers({ authorization: "Bearer synthetic" }))).toBeUndefined();
    expect(w.request("/", new Headers({ rsc: "1" }))).toBeUndefined();
    expect(w.request("/", new Headers(), "POST")).toBeUndefined();
    expect(w.storage.size).toBe(0);
  });

  it("rejects a corrupt installation and preserves unrelated/previous caches", async () => {
    const w = worker("bad", true);
    w.storage.set("another-app", new Map());
    w.storage.set(`${w.prefix}previous`, new Map());
    await expect(w.lifecycle("install")).rejects.toThrow("OFFLINE_ASSET_HASH_MISMATCH");
    expect([...w.storage.keys()]).toEqual(["another-app", `${w.prefix}previous`]);
  });

  it("retains a previous bundle and reuses a complete cache for an offline rollback", async () => {
    const w = worker();
    w.storage.set("another-app", new Map());
    w.storage.set("glymize-offline:https://app.test/:old-experimental", new Map());
    w.storage.set("glymize-pwa:https://app.test/:old-shell", new Map());
    w.storage.set(`${w.prefix}oldest`, new Map());
    w.storage.set(`${w.prefix}previous`, new Map());
    await w.lifecycle("install");
    await w.lifecycle("activate");
    expect([...w.storage.keys()]).toEqual(["another-app", `${w.prefix}previous`, `${w.prefix}v1`]);
    w.fetch.mockRejectedValue(new Error("offline"));
    await expect(w.lifecycle("install")).resolves.toBeUndefined();
    expect(w.fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects personalized responses and oversized bodies before activation", async () => {
    const rejectedHeaders: HeadersInit[] = [
      { "cache-control": "private" },
      { vary: "Cookie" },
      { "set-cookie": "test=1" },
    ];
    for (const headers of rejectedHeaders) {
      const w = worker();
      w.fetch.mockImplementation(async () => new Response("public bundle", { headers }));
      await expect(w.lifecycle("install")).rejects.toThrow("OFFLINE_ASSET_RESPONSE_REJECTED");
      expect(w.storage.size).toBe(0);
    }
    const w = worker();
    w.fetch.mockImplementation(async () => new Response("oversized public bundle"));
    await expect(w.lifecycle("install")).rejects.toThrow("OFFLINE_ASSET_SIZE_MISMATCH");
    expect(w.storage.size).toBe(0);
  });
});
