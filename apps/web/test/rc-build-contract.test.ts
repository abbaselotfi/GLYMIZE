import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const buildRc = readFileSync(
  fileURLToPath(new URL("../scripts/build-rc.mjs", import.meta.url)),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { scripts?: Record<string, string> };

describe("RC frontend build contract", () => {
  it("exports a custom-domain frontend with a same-origin runtime URL", () => {
    expect(packageJson.scripts?.["build:rc"]).toBe("node scripts/build-rc.mjs");
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
