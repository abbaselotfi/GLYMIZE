import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(WEB_ROOT, "scripts");
const OUT = path.join(WEB_ROOT, "out");

const upstream = process.env.GLYMIZE_RUNTIME_PROXY_UPSTREAM?.trim();
if (!upstream) {
  throw new Error("GLYMIZE_RUNTIME_PROXY_UPSTREAM_REQUIRED");
}

const buildEnv = {
  ...process.env,
  GITHUB_PAGES: "true",
  GITHUB_PAGES_CUSTOM_DOMAIN: "true",
  NEXT_PUBLIC_RUNTIME_API_URL: "/runtime-api",
  GLYMIZE_RUNTIME_PROXY_UPSTREAM: upstream,
};

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: WEB_ROOT,
    env: buildEnv,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`RC_BUILD_STEP_FAILED:${script}:${result.status ?? "unknown"}`);
  }
}

console.log("[rc-build] exporting custom-domain static frontend");
run("next.cjs", ["build", "--webpack"]);

console.log("[rc-build] enforcing Cloudflare Pages asset limits");
run("split-market-static-assets.mjs");

console.log("[rc-build] installing same-origin runtime gateway");
run("write-pages-runtime-proxy.mjs", [OUT]);

console.log("[rc-build] ready: out/ with /runtime-api -> RC runtime gateway");
