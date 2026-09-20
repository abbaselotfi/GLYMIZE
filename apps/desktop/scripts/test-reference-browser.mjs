import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".png", "image/png"], [".svg", "image/svg+xml"],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname === "/offline/" ? "/offline/index.html" : url.pathname;
    const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
    const filename = path.resolve(root, relative);
    if (!relative || (filename !== root && !filename.startsWith(`${root}${path.sep}`)) || !(await stat(filename)).isFile()) throw new Error("not_found");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes.get(path.extname(filename)) ?? "application/octet-stream",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
assert(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const requests = [];
const externalRequests = [];
const pageErrors = [];
page.on("request", (request) => {
  const url = new URL(request.url());
  requests.push(url.pathname);
  if (url.origin !== origin) externalRequests.push(request.url());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(`${origin}/offline/`, { waitUntil: "networkidle" });
  const input = page.locator('input[type="search"]');
  await input.waitFor({ state: "visible" });
  assert.match(await page.locator("main").innerText(), /نسخهٔ محلی نصب‌شده|INSTALLED LOCAL SNAPSHOT/);
  await input.fill("metformin");
  await page.locator("article").first().waitFor({ state: "visible" });
  assert((await page.locator("article").count()) > 0);
  assert.equal(await page.locator('a[target="_blank"]').count(), 0);
  assert((await page.locator("details code").count()) > 0);
  assert.deepEqual(externalRequests, []);
  assert.equal(requests.some((value) => /(?:manifest\.webmanifest|sw\.js|runtime-api|admin)/.test(value)), false);
  const clientState = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    workers: "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  }));
  assert.deepEqual(clientState, { local: [], session: [], workers: 0 });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ profile: "desktop-reference", requests: requests.length, externalRequests: 0,
    results: await page.locator("article").count(), clientState }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
