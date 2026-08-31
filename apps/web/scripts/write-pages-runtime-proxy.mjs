import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputArg = process.argv[2];
if (!outputArg) {
  throw new Error("PAGES_OUTPUT_DIR_REQUIRED");
}

const upstreamRaw =
  process.env.GLYMIZE_RUNTIME_PROXY_UPSTREAM?.trim();
if (!upstreamRaw) {
  throw new Error("GLYMIZE_RUNTIME_PROXY_UPSTREAM_REQUIRED");
}

const upstream = new URL(upstreamRaw);
if (
  upstream.protocol !== "https:" ||
  upstream.username ||
  upstream.password ||
  upstream.search ||
  upstream.hash ||
  upstream.pathname !== "/"
) {
  throw new Error("RUNTIME_PROXY_UPSTREAM_MUST_BE_HTTPS_ORIGIN");
}

const outputDir = path.resolve(outputArg);
const proxyPrefix = "/runtime-api";
const workerPath = path.join(outputDir, "_worker.js");
const routesPath = path.join(outputDir, "_routes.json");

const workerSource = `const UPSTREAM_ORIGIN = ${JSON.stringify(upstream.origin)};
const PROXY_PREFIX = ${JSON.stringify(proxyPrefix)};

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const apiPrefix = \`\${PROXY_PREFIX}/v1/\`;

    if (!incoming.pathname.startsWith(apiPrefix)) {
      return env.ASSETS.fetch(request);
    }

    const target = new URL(UPSTREAM_ORIGIN);
    target.pathname = incoming.pathname.slice(PROXY_PREFIX.length);
    target.search = incoming.search;

    const upstreamRequest = new Request(target.toString(), request);
    const upstreamResponse = await fetch(upstreamRequest, {
      redirect: "manual",
    });

    const headers = new Headers(upstreamResponse.headers);
    headers.set("cache-control", "no-store");
    headers.set(
      "x-glymize-runtime-gateway",
      "pages-same-origin",
    );

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  },
};
`;

const routes = {
  version: 1,
  include: [`${proxyPrefix}/v1/*`],
  exclude: [],
};

await mkdir(outputDir, { recursive: true });
await writeFile(workerPath, workerSource, "utf8");
await writeFile(
  routesPath,
  `${JSON.stringify(routes, null, 2)}\n`,
  "utf8",
);

console.log(`Runtime gateway worker: ${workerPath}`);
console.log(`Runtime gateway routes: ${routesPath}`);
console.log(`Runtime upstream: ${upstream.origin}`);
