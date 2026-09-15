import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { writeOfflineBundle } from "./write-offline-bundle.mjs";

const root = await mkdtemp(path.join(tmpdir(), "glymize-offline-browser-"));
const output = path.join(root, "out");
const profile = path.join(root, "profile");
let context;
let server;
try {
  const html =
    "<!doctype html><html><head><meta charset='utf-8'></head><body><h1>GLYMIZE offline fixture</h1></body></html>";
  for (const file of [
    "index.html",
    "offline/index.html",
    "data/offline-reference.json",
    "type-2/index.html",
    "type-1/index.html",
    "pregnancy/index.html",
    "icon-192.png",
    "icon-512.png",
    "_next/static/test.js",
    "data/admin-catalog.json",
  ]) {
    await mkdir(path.dirname(path.join(output, file)), { recursive: true });
    await writeFile(
      path.join(output, file),
      file.endsWith(".html")
        ? html
        : file.endsWith(".json")
          ? '{"fixture":true}'
          : "public fixture",
    );
  }
  const manifest = await writeOfflineBundle(output);
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(
      output,
      `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`,
    );
    if (!file.startsWith(`${output}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.setHeader(
        "content-type",
        file.endsWith(".js")
          ? "application/javascript"
          : file.endsWith(".html")
            ? "text/html"
            : file.endsWith(".json")
              ? "application/json"
              : "application/octet-stream",
      );
      response.setHeader(
        "cache-control",
        pathname.startsWith("/_offline/") ? "public, max-age=31536000, immutable" : "no-cache",
      );
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const options = {
    headless: true,
    ...(process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1" ? { channel: "chrome" } : {}),
  };
  context = await chromium.launchPersistentContext(profile, options);
  let page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(async () => {
    await caches.open("unrelated-application");
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.goto(`${origin}/offline/`);
  assert.equal(await page.locator("h1").textContent(), "GLYMIZE offline fixture");
  const evidence = await page.evaluate(async () => {
    const data = await fetch("/data/offline-reference.json?t=123", { cache: "no-store" });
    const privateDenied = await fetch("/runtime-api/v1/patients/synthetic").then(
      () => false,
      () => true,
    );
    return {
      version: data.headers.get("x-glymize-offline-version"),
      data: await data.json(),
      privateDenied,
      unrelatedPreserved: (await caches.keys()).includes("unrelated-application"),
    };
  });
  assert.equal(evidence.version, manifest.version);
  assert.equal(evidence.data.fixture, true);
  assert.equal(evidence.privateDenied, true);
  assert.equal(evidence.unrelatedPreserved, true);
  await context.close();
  context = await chromium.launchPersistentContext(profile, options);
  await context.setOffline(true);
  page = await context.newPage();
  await page.goto(`${origin}/offline/`);
  assert.equal(await page.locator("h1").textContent(), "GLYMIZE offline fixture");
  console.log(
    JSON.stringify({
      result: "PASS",
      kind: "synthetic-export-real-chromium",
      browser: context.browser()?.version(),
      version: manifest.version,
      assets: manifest.assets.length,
      restartOffline: true,
      ...evidence,
    }),
  );
} finally {
  await context?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  // Only the mkdtemp-owned fixture/profile are removed.
  await rm(root, { recursive: true, force: true });
}
