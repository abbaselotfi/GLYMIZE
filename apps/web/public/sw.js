const BUILD_VERSION = "__GLYMIZE_BUILD_VERSION__";
const CACHE_NAME = `glymize-pwa-${BUILD_VERSION}`;
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const pathFor = (path) => `${BASE_PATH}${path}`;
const APP_SHELL = ["/", "/type-2/", "/type-1/", "/pregnancy/", "/icon-192.png", "/icon-512.png"].map(pathFor);
const DATA_PREFIX = pathFor("/data/");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);
  const transient = request.cache === "no-store" || url.searchParams.has("t");
  const dataRequest = url.pathname.startsWith(DATA_PREFIX);

  // Runtime data can be tens of megabytes and transient version probes use a
  // unique URL. Never clone/write either category into Cache Storage.
  if (transient || dataRequest) {
    event.respondWith(fetch(request));
    return;
  }

  // Keep the service worker lightweight: only the explicit APP_SHELL is
  // persisted. Other stable requests remain network-first and can fall back to
  // an already pre-cached shell document when the browser is offline.
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const shell = await caches.match(pathFor("/"));
        if (shell) return shell;
      }
      return Response.error();
    }),
  );
});
