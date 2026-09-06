import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(WEB_ROOT, "scripts");
const isCloudflarePages = process.env.CF_PAGES === "1";
const isRcProduction = isCloudflarePages && process.env.CF_PAGES_BRANCH === "main";

function run(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: WEB_ROOT,
    env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`WEB_BUILD_STEP_FAILED:${script}:${result.status ?? "unknown"}`);
  }
}

if (isRcProduction) {
  console.log("[web-build] Cloudflare Pages main detected; using RC runtime-gateway build");
  run("build-rc.mjs");
  process.exit(0);
}

const buildEnv = isCloudflarePages
  ? {
      ...process.env,
      GITHUB_PAGES: "true",
      GITHUB_PAGES_CUSTOM_DOMAIN: "true",
      // Preview deployments are UI-only. Do not expose the RC runtime through
      // branch-specific *.pages.dev URLs.
      NEXT_PUBLIC_RUNTIME_API_URL: "",
    }
  : process.env;

run("next.cjs", ["build", "--webpack"], buildEnv);
run("split-market-static-assets.mjs", [], buildEnv);
