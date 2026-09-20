import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const output = fileURLToPath(new URL("../out/", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(output, "offline-bundle.json"), "utf8"));
const basePath = manifest.basePath;
assert.equal(manifest.profile, "reference-lite");
assert(!manifest.assets.some((asset) => /admin-catalog|market-v2|\/type-[12]\/|\/pregnancy\//.test(asset.path)));
const profile = await mkdtemp(path.join(tmpdir(), "glymize-static-browser-"));
let context;
let page;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture.test");
  if (!url.pathname.startsWith(`${basePath}/`)) { response.writeHead(404).end(); return; }
  let relative;
  try { relative = decodeURIComponent(url.pathname.slice(basePath.length)); }
  catch { response.writeHead(400).end(); return; }
  let file = path.resolve(output, `.${relative.endsWith("/") ? `${relative}index.html` : relative}`);
  if (!file.startsWith(`${path.resolve(output)}${path.sep}`)) { response.writeHead(403).end(); return; }
  let body;
  let status = 200;
  try { body = await readFile(file); }
  catch {
    if (request.headers["sec-fetch-dest"] !== "document") { response.writeHead(404).end(); return; }
    file = path.join(output, "404.html");
    body = await readFile(file);
    status = 404;
  }
  const types = { ".js": "application/javascript", ".html": "text/html; charset=utf-8", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
  response.writeHead(status, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  response.end(body);
});
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // Production-like hostname avoids the app's intentional localhost PWA reset.
  const origin = `http://glymize.test:${server.address().port}`;
  const options = {
    headless: true,
    channel: process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1" ? "chrome" : "chromium",
    args: ["--host-resolver-rules=MAP glymize.test 127.0.0.1", "--no-proxy-server", `--unsafely-treat-insecure-origin-as-secure=${origin}`],
  };
  context = await chromium.launchPersistentContext(profile, options);
  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(20_000);
  await context.addInitScript(({ scope }) => {
    if (localStorage.getItem("synthetic-cache-migration-seeded")) return;
    localStorage.setItem("synthetic-cache-migration-seeded", "1");
    void Promise.all([caches.open("unrelated-application"), caches.open(`glymize-offline:${scope}:old-experimental`), caches.open(`glymize-pwa:${scope}:old-shell`)]);
  }, { scope: `${origin}${basePath}/` });
  page = await context.newPage();
  page.on("pageerror", (error) => console.error("[static-browser] page error", error));
  console.log("[static-browser] legacy route");
  const id = "synthetic-A%2F+&ب";
  await page.goto(`${origin}${basePath}/patients/${encodeURIComponent(id)}/`);
  await page.waitForURL((url) => url.pathname === `${basePath}/patients/` && url.searchParams.get("patientId") === id);
  assert.equal(await page.locator('meta[name="referrer"]').getAttribute("content"), "no-referrer");
  const missing = await page.goto(`${origin}${basePath}/unrelated-missing/`);
  assert.equal(missing.status(), 404);
  const nestedMissing = await page.goto(`${origin}${basePath}/offline/unrelated-missing/`);
  assert.equal(nestedMissing.status(), 404);
  console.log("[static-browser] install bundle");
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const poison = JSON.stringify({ schemaVersion: 2, revision: 999999, updatedAt: "2099-01-01T00:00:00Z", updatedBy: "synthetic-poison", masterDrugRegistry: [], medications: [], notifications: [] });
  await page.evaluate((value) => localStorage.setItem("glymize-browser-catalog-v2", value), poison);
  await page.goto(`${origin}${basePath}/offline/`);
  await page.locator('input[type="search"]').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("glymize-browser-catalog-v2")), poison);
  await page.getByRole("button", { name: /دریافت \/ به‌روزرسانی/ }).click();
  await page.getByRole("status").filter({ hasText: "دریافت کامل شد" }).waitFor({ timeout: 120000 });
  await page.evaluate(async (scope) => {
    await caches.open("unrelated-application");
    await navigator.serviceWorker.ready;
  }, `${basePath}/`);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 60_000 });
  const cacheKeys = await page.evaluate(() => caches.keys());
  assert(cacheKeys.includes("unrelated-application"));
  assert(!cacheKeys.some((key) => key.endsWith(":old-experimental") || key.endsWith(":old-shell")));
  console.log("[static-browser] offline navigation");
  await context.setOffline(true);
  await page.reload();
  await page.locator('input[type="search"]').fill("metformin");
  await page.locator("article").first().getByText(/metformin/i).first().waitFor();
  assert(await page.locator("article").count() > 0);
  assert(await page.locator("article").count() <= 30);
  assert.equal(new URL(page.url()).search, "");
  await page.locator(`a[href="${basePath}/"]`).first().click();
  await page.waitForURL(`${origin}${basePath}/`);
  await page.locator(`a[href="${basePath}/offline/"]`).first().click();
  await page.waitForURL(`${origin}${basePath}/offline/`);
  await page.goBack();
  await page.waitForURL(`${origin}${basePath}/`);
  await page.goForward();
  await page.waitForURL(`${origin}${basePath}/offline/`);
  await page.locator('input[type="search"]').waitFor();
  assert(!requests.some((url) => /runtime-api|admin-catalog|market-v2|\/v1\/|claim-policy/.test(url)));
  const denied = await page.evaluate(async () => fetch("/runtime-api/v1/patients/synthetic").then(() => false, () => true));
  assert.equal(denied, true);
  await context.close();
  context = await chromium.launchPersistentContext(profile, options);
  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(20_000);
  console.log("[static-browser] cold restart");
  await context.setOffline(true);
  page = await context.newPage();
  await page.goto(`${origin}${basePath}/offline/`);
  await page.locator('input[type="search"]').waitFor();
  assert.equal(await page.locator('input[type="search"]').inputValue(), "");
  assert(await page.locator("article").count() > 0);
  console.log("[static-browser] host blackout");
  // Host blackout with navigator.onLine still true, not merely DevTools offline.
  await context.setOffline(false);
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await page.reload();
  await page.locator('input[type="search"]').fill("metformin");
  await page.locator("article").first().getByText(/metformin/i).first().waitFor();
  assert(await page.locator("article").count() > 0);
  assert.equal(await page.evaluate(() => navigator.onLine), true);
  await page.screenshot({ path: path.join(output, "offline-reference-preview.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("article").first().scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, "offline-reference-mobile.png") });
  console.log(JSON.stringify({ browser: context.browser().version(), version: manifest.version, basePath, legacyIdRoundTrip: true, unrelated404: true, offlineNavigation: true, restart: true, hostBlackout: true, privateDenied: true, clinicalAccess: "not claimed; existing auth gate preserved" }));
} catch (error) {
  console.error("[static-browser] failed", error);
  console.error("[static-browser] current URL", page?.url());
  throw error;
} finally {
  await context?.close();
  if (server.listening) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await rm(profile, { recursive: true, force: true });
}
