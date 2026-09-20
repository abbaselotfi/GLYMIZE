import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import net from "node:net";
import { chromium } from "@playwright/test";

const executable = process.env.GLYMIZE_NATIVE_EXE;
assert(executable, "GLYMIZE_NATIVE_EXE is required");
await access(executable);

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const { port } = address;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForEndpoint(url, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assert(child.exitCode === null, `native shell exited before CDP was ready: ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local debugging endpoint is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("NATIVE_CDP_TIMEOUT");
}

async function waitForReferencePage(browser, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => candidate.url() === "https://tauri.localhost/offline/index.html");
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const urls = browser.contexts().flatMap((context) => context.pages()).map((page) => page.url());
  throw new Error(`NATIVE_REFERENCE_PAGE_TIMEOUT: ${urls.join(", ")}`);
}

const port = await reservePort();
const endpoint = `http://127.0.0.1:${port}`;
const startedAt = Date.now();
const child = spawn(executable, [], {
  windowsHide: true,
  stdio: "ignore",
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: [
      `--remote-debugging-port=${port}`,
      "--proxy-server=127.0.0.1:9",
      "--proxy-bypass-list=<-loopback>",
    ].join(" "),
  },
});

let browser;
try {
  await waitForEndpoint(`${endpoint}/json/version`, child);
  const cdpReadyMs = Date.now() - startedAt;
  browser = await chromium.connectOverCDP(endpoint);
  const page = await waitForReferencePage(browser);

  const pageRequests = [];
  const pageErrors = [];
  page.on("request", (request) => pageRequests.push(request.url()));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.reload({ waitUntil: "networkidle" });

  const input = page.locator('input[type="search"]');
  await input.waitFor({ state: "visible" });
  const uiReadyMs = Date.now() - startedAt;
  assert.match(await page.locator("main").innerText(), /نسخهٔ محلی نصب‌شده|INSTALLED LOCAL SNAPSHOT/);
  await input.fill("metformin");
  await page.locator("article").first().waitFor({ state: "visible" });

  const externalPageRequests = pageRequests.filter((value) => new URL(value).origin !== "https://tauri.localhost");
  const clientState = await page.evaluate(async () => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
    workers: "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  }));
  assert.deepEqual(externalPageRequests, []);
  assert(Object.keys(clientState.local).every((key) => key === "glymize-ui-language"));
  if (clientState.local["glymize-ui-language"] !== undefined) {
    assert.match(clientState.local["glymize-ui-language"], /^(?:fa|en)$/);
  }
  assert.equal(Object.values(clientState.local).includes("metformin"), false);
  assert.deepEqual(clientState.session, {});
  assert.equal(clientState.workers, 0);
  assert.deepEqual(pageErrors, []);
  assert.equal(await page.locator('a[target="_blank"]').count(), 0);

  const nativePolicy = await page.evaluate(async () => {
    const violations = [];
    const recordViolation = (event) => violations.push({
      blockedURI: event.blockedURI,
      directive: event.effectiveDirective,
    });
    document.addEventListener("securitypolicyviolation", recordViolation);
    let externalFetchRejected = false;
    try {
      await fetch("https://example.com/native-policy-probe", { mode: "no-cors" });
    } catch {
      externalFetchRejected = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    document.removeEventListener("securitypolicyviolation", recordViolation);
    const newWindowDenied = window.open("https://tauri.localhost/offline/index.html", "_blank") === null;
    return {
      externalFetchRejected,
      globalTauri: typeof window.__TAURI__,
      newWindowDenied,
      violations,
    };
  });
  assert.equal(nativePolicy.externalFetchRejected, true);
  assert.equal(nativePolicy.globalTauri, "undefined");
  assert.equal(nativePolicy.newWindowDenied, true);
  assert(nativePolicy.violations.some((violation) => violation.directive === "connect-src"));

  let localNavigationDenied = false;
  try {
    await page.goto("https://tauri.localhost/admin/", { waitUntil: "commit", timeout: 3_000 });
  } catch {
    localNavigationDenied = true;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(localNavigationDenied, true);
  assert.equal(page.url(), "https://tauri.localhost/offline/index.html");

  console.log(JSON.stringify({
    profile: "installed-native-reference",
    url: page.url(),
    cdpReadyMs,
    uiReadyMs,
    pageRequests: pageRequests.length,
    externalPageRequests: externalPageRequests.length,
    results: await page.locator("article").count(),
    clientState,
    nativePolicy,
    localNavigationDenied,
  }));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
