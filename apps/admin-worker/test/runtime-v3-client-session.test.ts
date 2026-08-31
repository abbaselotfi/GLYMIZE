import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime v3 client session bridge", () => {
  it("uses the shared runtime session store after physician and assistant password login", () => {
    const runtimeClient = fs.readFileSync(
      new URL("../../web/lib/runtime-client.ts", import.meta.url),
      "utf8",
    );
    const runtimeV3Client = fs.readFileSync(
      new URL("../../web/lib/runtime-v3-client.ts", import.meta.url),
      "utf8",
    );

    expect(runtimeClient).toContain("export function adoptRuntimeSession");
    expect(runtimeClient).toContain("cachedUser = session.user;");
    expect(runtimeClient).toContain("emitAuthChange();");

    expect(runtimeV3Client).toContain("loginPhysicianWithPassword");
    expect(runtimeV3Client).toContain("loginAssistantWithPassword");
    expect(
      runtimeV3Client.match(/adoptRuntimeSession\(result,rememberMe\)/g)?.length,
    ).toBe(2);
    expect(runtimeV3Client).toContain("getRuntimeAccessToken()");
    expect(runtimeV3Client).toContain("result.ready");
    expect(runtimeV3Client).not.toContain("glymize-runtime-access-v1");
    expect(runtimeV3Client).not.toContain("glymize-runtime-refresh-v1");
    expect(runtimeV3Client).not.toContain("glymize-runtime-refresh-session-v1");
  });
});
