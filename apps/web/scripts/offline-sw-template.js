// Replaced after static export; an unbuilt template must never cache pages.
const BUNDLE = /* OFFLINE_BUNDLE */ null;
const PREFIX = `glymize-offline:${self.registration.scope}:`;
const PROFILE_PREFIX = `${PREFIX}reference-lite:`;
const CACHE_NAME = `${PROFILE_PREFIX}${BUNDLE?.version ?? "unbuilt"}`;
const assets = new Map((BUNDLE?.assets ?? []).map((asset) => [asset.path, asset]));
// Small PUBLIC responses only in this browser Service Worker's isolate.
const memory = new Map();
let memoryBytes = 0;
const MEMORY_BYTES = 4 * 1024 * 1024;
const MEMORY_TTL_MS = 5 * 60 * 1000;

function remember(asset, response) {
  if (asset.bytes > 256 * 1024) return;
  const previous = memory.get(asset.path);
  if (previous) memoryBytes -= previous.bytes;
  memory.delete(asset.path);
  while (memory.size && (memory.size >= 32 || memoryBytes + asset.bytes > MEMORY_BYTES)) {
    const key = memory.keys().next().value;
    memoryBytes -= memory.get(key).bytes;
    memory.delete(key);
  }
  memory.set(asset.path, {
    response: response.clone(),
    bytes: asset.bytes,
    expires: Date.now() + MEMORY_TTL_MS,
  });
  memoryBytes += asset.bytes;
}

async function verifiedResponse(asset) {
  const response = await fetch(new URL(asset.snapshot, self.location.origin), {
    credentials: "omit",
    cache: "reload",
    redirect: "error",
  });
  const vary = response.headers.get("vary") ?? "";
  if (
    response.status !== 200 ||
    response.headers.has("set-cookie") ||
    /private|no-store/i.test(response.headers.get("cache-control") ?? "") ||
    vary.split(",").some((v) => v.trim() && v.trim().toLowerCase() !== "accept-encoding")
  ) {
    await response.body?.cancel();
    throw new Error("OFFLINE_ASSET_RESPONSE_REJECTED");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("OFFLINE_ASSET_BODY_MISSING");
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > asset.bytes) {
      await reader.cancel();
      throw new Error("OFFLINE_ASSET_SIZE_MISMATCH");
    }
    chunks.push(value);
  }
  if (bytes !== asset.bytes) throw new Error("OFFLINE_ASSET_SIZE_MISMATCH");
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== asset.sha256) throw new Error("OFFLINE_ASSET_HASH_MISMATCH");
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("vary");
  headers.set("x-glymize-offline-version", BUNDLE.version);
  return new Response(buffer, { headers });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (!BUNDLE || BUNDLE.schemaVersion !== 1 || BUNDLE.profile !== "reference-lite") throw new Error("OFFLINE_BUNDLE_NOT_BUILT");
      const cache = await caches.open(CACHE_NAME);
      // A rollback can reuse a complete previously verified bundle while offline.
      let complete = assets.size > 0;
      for (const asset of assets.values()) {
        if (!(await cache.match(new URL(asset.path, self.location.origin)))) {
          complete = false;
          break;
        }
      }
      if (complete) return;
      try {
        // Sequential download bounds memory/network use; incomplete install never activates.
        for (const asset of assets.values()) {
          await cache.put(new URL(asset.path, self.location.origin), await verifiedResponse(asset));
        }
      } catch (error) {
        await caches.delete(CACHE_NAME);
        throw error;
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "REFERENCE_BUNDLE_STATUS" && event.source?.url
    && new URL(event.source.url).origin === self.location.origin) {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        for (const asset of assets.values()) {
          const key = new URL(asset.path, self.location.origin);
          const hit = await cache.match(key);
          if (hit) void hit.body?.cancel().catch(() => {});
          else await cache.put(key, await verifiedResponse(asset));
        }
        event.ports?.[0]?.postMessage({ profile: BUNDLE?.profile, version: BUNDLE?.version });
      } catch { event.ports?.[0]?.postMessage({ error: "OFFLINE_REFERENCE_INCOMPLETE" }); }
    })());
  }
  if (
    event.data?.type === "SKIP_WAITING" &&
    event.source?.url &&
    new URL(event.source.url).origin === self.location.origin
  )
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const legacyPrefix = `glymize-pwa:${self.registration.scope}:`;
      const keys = (await caches.keys()).filter((key) => key.startsWith(PREFIX) || key.startsWith(legacyPrefix));
      // Never retain an experimental clinical-shell/raw-admin bundle as reference rollback.
      const previous = keys.filter((key) => key.startsWith(PROFILE_PREFIX) && key !== CACHE_NAME).at(-1);
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== previous)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function bundledResponse(asset) {
  const entry = memory.get(asset.path);
  if (entry && entry.expires > Date.now()) return entry.response.clone();
  if (entry) {
    memoryBytes -= entry.bytes;
    memory.delete(asset.path);
  }
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(new URL(asset.path, self.location.origin));
  if (hit) {
    remember(asset, hit);
    return hit;
  }
  // Eviction recovery must fetch the same immutable version, never the latest alias.
  const response = await verifiedResponse(asset);
  await cache.put(new URL(asset.path, self.location.origin), response.clone());
  remember(asset, response);
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("authorization") ||
    request.headers.has("range")
  )
    return;
  const asset = assets.get(url.pathname);
  if (!asset) return;
  // Only public data's existing t/v hints map to the active bundle.
  if (
    [...url.searchParams.keys()].some(
      (key) => !url.pathname.startsWith(`${BUNDLE.basePath}/data/`) || !["t", "v"].includes(key),
    )
  )
    return;
  if (request.headers.has("rsc") || request.headers.has("next-router-state-tree")) return;
  event.respondWith(bundledResponse(asset).catch(() => Response.error()));
});
