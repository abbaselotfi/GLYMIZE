import { describe, expect, it } from "vitest";
import { isRuntimeOriginAllowed } from "../src/platform-cors";

describe("runtime CORS exact-origin allowlist", () => {
  const primaryOnly = {
    ADMIN_ORIGIN: "https://rc.glymize.ir",
  };

  const rcWithLocal = {
    ADMIN_ORIGIN: "https://rc.glymize.ir",
    ADMIN_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3001",
  };

  it("allows the canonical primary origin", () => {
    expect(
      isRuntimeOriginAllowed("https://rc.glymize.ir", primaryOnly),
    ).toBe(true);
  });

  it("allows only explicitly configured development origins", () => {
    expect(
      isRuntimeOriginAllowed("http://localhost:3000", rcWithLocal),
    ).toBe(true);
    expect(
      isRuntimeOriginAllowed("http://localhost:3001", rcWithLocal),
    ).toBe(true);
  });

  it("rejects arbitrary, lookalike, wildcard and absent origins", () => {
    for (const origin of [
      "http://localhost:3002",
      "http://localhost:3000.evil.example",
      "https://evil.example",
      "https://rc.glymize.ir.evil.example",
      " http://localhost:3000",
      "http://localhost:3000 ",
      "*",
      null,
    ]) {
      expect(isRuntimeOriginAllowed(origin, rcWithLocal)).toBe(false);
    }
  });

  it("fails closed on malformed configured additions", () => {
    const malformed = {
      ADMIN_ORIGIN: "https://rc.glymize.ir",
      ADMIN_ALLOWED_ORIGINS:
        "*,not-a-url,http://localhost:3000/path,https://evil.example/path",
    };

    expect(
      isRuntimeOriginAllowed("https://rc.glymize.ir", malformed),
    ).toBe(true);
    expect(
      isRuntimeOriginAllowed("http://localhost:3000", malformed),
    ).toBe(false);
    expect(
      isRuntimeOriginAllowed("https://evil.example", malformed),
    ).toBe(false);
  });

  it("preserves single-origin behavior when the extra allowlist is absent", () => {
    expect(
      isRuntimeOriginAllowed("http://localhost:3000", primaryOnly),
    ).toBe(false);
  });
});
