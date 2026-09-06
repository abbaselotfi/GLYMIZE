import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routeAwareShell = readFileSync(
  fileURLToPath(new URL("../app/components/route-aware-shell.tsx", import.meta.url)),
  "utf8",
);
const rootLayout = readFileSync(
  fileURLToPath(new URL("../app/layout.tsx", import.meta.url)),
  "utf8",
);

describe("patient app shell boundary", () => {
  it("keeps /patient and nested patient routes outside the clinician shell", () => {
    expect(routeAwareShell).toContain('pathname === "/patient"');
    expect(routeAwareShell).toContain('pathname.startsWith("/patient/")');
    expect(routeAwareShell).toContain("if (isPatientAppPath) return <>{children}</>");
  });

  it("uses the route-aware root shell instead of wrapping every route in AppShell", () => {
    expect(rootLayout).toContain('import RouteAwareShell from "./components/route-aware-shell"');
    expect(rootLayout).toContain("<RouteAwareShell>{children}</RouteAwareShell>");
    expect(rootLayout).not.toContain("<AppShell>{children}</AppShell>");
  });

  it("still delegates all non-patient routes to the clinician-aware AppShell", () => {
    expect(routeAwareShell).toContain('import AppShell from "./app-shell"');
    expect(routeAwareShell).toContain("return <AppShell>{children}</AppShell>");
  });
});
