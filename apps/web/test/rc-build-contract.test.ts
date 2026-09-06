import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const buildWeb = readFileSync(
  fileURLToPath(new URL("../scripts/build-web.mjs", import.meta.url)),
  "utf8",
);
const buildRc = readFileSync(
  fileURLToPath(new URL("../scripts/build-rc.mjs", import.meta.url)),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { scripts?: Record<string, string> };

describe("RC frontend build contract", () => {
  it("routes the default Cloudflare Pages main build into the RC pipeline", () => {
    expect(packageJson.scripts?.build).toBe("node scripts/build-web.mjs");
    expect(packageJson.scripts?.["build:rc"]).toBe("node scripts/build-rc.mjs");
    expect(buildWeb).toContain('process.env.CF_PAGES === "1"');
    expect(buildWeb).toContain('process.env.CF_PAGES_BRANCH === "main"');
    expect(buildWeb).toContain('run("build-rc.mjs")');
  });

  it("keeps Cloudflare preview deployments disconnected from the RC runtime", () => {
    expect(buildWeb).toContain('NEXT_PUBLIC_RUNTIME_API_URL: ""');
    expect(buildWeb).toContain("Preview deployments are UI-only");
  });

  it("exports RC for the custom domain with a same-origin runtime URL", () => {
    expect(buildRc).toContain('GITHUB_PAGES: "true"');
    expect(buildRc).toContain('GITHUB_PAGES_CUSTOM_DOMAIN: "true"');
    expect(buildRc).toContain('NEXT_PUBLIC_RUNTIME_API_URL: "/runtime-api"');
  });

  it("fails closed when the RC runtime upstream is not configured", () => {
    expect(buildRc).toContain("GLYMIZE_RUNTIME_PROXY_UPSTREAM?.trim()");
    expect(buildRc).toContain('throw new Error("GLYMIZE_RUNTIME_PROXY_UPSTREAM_REQUIRED")');
  });

  it("builds, enforces Pages asset limits, then installs the runtime gateway", () => {
    expect(buildRc).toContain('run("next.cjs", ["build", "--webpack"])');
    expect(buildRc).toContain('run("split-market-static-assets.mjs")');
    expect(buildRc).toContain('run("write-pages-runtime-proxy.mjs", [OUT])');
  });
});
