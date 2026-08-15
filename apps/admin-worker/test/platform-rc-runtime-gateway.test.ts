import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("RC same-origin clinical runtime gateway", () => {
  const runtimeUrl = fs.readFileSync(
    new URL("../../web/lib/runtime-api-url.ts", import.meta.url),
    "utf8",
  );
  const runtimeClient = fs.readFileSync(
    new URL("../../web/lib/runtime-client.ts", import.meta.url),
    "utf8",
  );
  const runtimeV3Client = fs.readFileSync(
    new URL("../../web/lib/runtime-v3-client.ts", import.meta.url),
    "utf8",
  );
  const adminAuth = fs.readFileSync(
    new URL("../../web/lib/admin-auth.ts", import.meta.url),
    "utf8",
  );
  const gateway = fs.readFileSync(
    new URL("../../web/scripts/write-pages-runtime-proxy.mjs", import.meta.url),
    "utf8",
  );

  it("prefers a dedicated clinical runtime URL while preserving the existing admin URL fallback", () => {
    expect(runtimeUrl).toContain("NEXT_PUBLIC_RUNTIME_API_URL");
    expect(runtimeUrl).toContain("NEXT_PUBLIC_ADMIN_API_URL");
    expect(runtimeClient).toContain('from "./runtime-api-url"');
    expect(runtimeV3Client).toContain('from "./runtime-api-url"');
    expect(adminAuth).toContain("NEXT_PUBLIC_ADMIN_API_URL");
    expect(adminAuth).not.toContain("NEXT_PUBLIC_RUNTIME_API_URL");
  });

  it("generates a fixed-upstream Pages gateway limited to the runtime v1 path", () => {
    expect(gateway).toContain("GLYMIZE_RUNTIME_PROXY_UPSTREAM");
    expect(gateway).toContain('const proxyPrefix = "/runtime-api"');
    expect(gateway).toContain('include: [`${proxyPrefix}/v1/*`]');
    expect(gateway).toContain("env.ASSETS.fetch(request)");
    expect(gateway).toContain('redirect: "manual"');
    expect(gateway).toContain('"cache-control", "no-store"');
  });
});
