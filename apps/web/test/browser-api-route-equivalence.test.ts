import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const browserApiSource = readFileSync(
  new URL("../lib/api-client.ts", import.meta.url),
  "utf8",
);
const catalogControllerSource = readFileSync(
  new URL("../../api/src/catalog/catalog.controller.ts", import.meta.url),
  "utf8",
);
const guidelineControllerSource = readFileSync(
  new URL("../../api/src/guidelines/guideline.controller.ts", import.meta.url),
  "utf8",
);

type SharedRouteGuard = {
  label: string;
  controllerNeedles: string[];
  browserNeedles: string[];
};

const sharedRouteGuards: SharedRouteGuard[] = [
  {
    label: "GET catalogue generics",
    controllerNeedles: ['@Get("catalog/generics")'],
    browserNeedles: ['method === "GET" && pathname === "/v1/catalog/generics"'],
  },
  {
    label: "GET catalogue reference sources",
    controllerNeedles: ['@Get("admin/catalog/reference-sources")'],
    browserNeedles: ['method === "GET" && pathname === "/v1/admin/catalog/reference-sources"'],
  },
  {
    label: "GET medication checklist",
    controllerNeedles: ['@Get("admin/catalog/medication-checklist")'],
    browserNeedles: ['method === "GET" && pathname === "/v1/admin/catalog/medication-checklist"'],
  },
  {
    label: "PATCH medication visibility",
    controllerNeedles: ['@Patch("admin/catalog/medication-checklist/:referencePresentationId")'],
    browserNeedles: ["const visibilityMatch = pathname.match(", 'method === "PATCH" && visibilityMatch'],
  },
  {
    label: "PATCH medication insurance",
    controllerNeedles: ['@Patch("admin/catalog/medication-checklist/:referencePresentationId/insurance")'],
    browserNeedles: ["const insuranceMatch = pathname.match(", 'method === "PATCH" && insuranceMatch'],
  },
  {
    label: "PATCH medication market data",
    controllerNeedles: ['@Patch("admin/catalog/medication-checklist/:referencePresentationId/market-data")'],
    browserNeedles: ["const marketDataMatch = pathname.match(", 'method === "PATCH" && marketDataMatch'],
  },
  {
    label: "GET admin notifications",
    controllerNeedles: ['@Get("admin/notifications")'],
    browserNeedles: ['method === "GET" && pathname === "/v1/admin/notifications"'],
  },
  {
    label: "POST admin notification",
    controllerNeedles: ['@Post("admin/notifications")'],
    browserNeedles: ['method === "POST" && pathname === "/v1/admin/notifications"'],
  },
  {
    label: "PATCH admin notification",
    controllerNeedles: ['@Patch("admin/notifications/:notificationId")'],
    browserNeedles: ["const notificationMatch = pathname.match(", 'method === "PATCH" && notificationMatch'],
  },
  {
    label: "GET catalogue update runs",
    controllerNeedles: ['@Get("admin/catalog/update-runs")'],
    browserNeedles: ['method === "GET" && pathname === "/v1/admin/catalog/update-runs"'],
  },
  {
    label: "POST medication brand",
    controllerNeedles: ['@Post("admin/catalog/medication-checklist/:referencePresentationId/brands")'],
    browserNeedles: ["const addBrandMatch = pathname.match(", 'method === "POST" && addBrandMatch'],
  },
  {
    label: "PATCH or DELETE medication brand",
    controllerNeedles: [
      '@Patch("admin/catalog/medication-checklist/:referencePresentationId/brands/:brandId")',
      '@Delete("admin/catalog/medication-checklist/:referencePresentationId/brands/:brandId")',
    ],
    browserNeedles: [
      "const brandMatch = pathname.match(",
      'method === "DELETE"',
      'method === "PATCH"',
    ],
  },
  {
    label: "GET Type 2 protocol seed",
    controllerNeedles: ['@Get("protocols/type-2")'],
    browserNeedles: ['method === "GET" && pathname === "/v1/protocols/type-2"'],
  },
  {
    label: "POST Type 2 assessment",
    controllerNeedles: ['@Post("catalog/type-2/considerations")'],
    browserNeedles: ['method === "POST" && pathname === "/v1/catalog/type-2/considerations"'],
  },
  {
    label: "GET Type 2 compatibility preview",
    controllerNeedles: ['@Get("admin/preview/type-2-considerations")'],
    browserNeedles: ['method === "GET" && pathname === "/v1/admin/preview/type-2-considerations"'],
  },
  {
    label: "POST generic medication",
    controllerNeedles: ['@Post("admin/catalog/generics")'],
    browserNeedles: ['method === "POST" && pathname === "/v1/admin/catalog/generics"'],
  },
  {
    label: "POST catalogue import request",
    controllerNeedles: ['@Post("admin/catalog/imports")'],
    browserNeedles: ['method === "POST" && pathname === "/v1/admin/catalog/imports"'],
  },
];

describe("browser/Nest compatibility route equivalence", () => {
  it.each(sharedRouteGuards)("guards the shared route surface: $label", ({ controllerNeedles, browserNeedles }) => {
    for (const needle of controllerNeedles) {
      expect(catalogControllerSource).toContain(needle);
    }
    for (const needle of browserNeedles) {
      expect(browserApiSource).toContain(needle);
    }
  });

  it("guards the shared guideline source and update-check routes", () => {
    expect(guidelineControllerSource).toContain('@Controller("v1/admin/guidelines")');
    expect(guidelineControllerSource).toContain("@Get()");
    expect(guidelineControllerSource).toContain('@Post(":sourceId/check")');
    expect(browserApiSource).toContain('pathname === "/v1/admin/guidelines"');
    expect(browserApiSource).toContain("const guidelineMatch = pathname.match(");
    expect(browserApiSource).toContain('method === "POST" && guidelineMatch');
  });

  it("keeps documented compatibility-only exceptions out of the required shared surface", () => {
    expect(catalogControllerSource).toContain('@Get("admin/catalog/reference-presentations")');
    expect(guidelineControllerSource).toContain('@Get("rule-pack")');
    expect(browserApiSource).not.toContain('pathname === "/v1/admin/catalog/reference-presentations"');
    expect(browserApiSource).not.toContain('pathname === "/v1/admin/guidelines/rule-pack"');

    expect(browserApiSource).toContain('pathname === "/v1/admin/catalog/master-registry"');
    expect(browserApiSource).toContain('pathname === "/v1/admin/catalog/master-candidates"');
    expect(catalogControllerSource).not.toContain('admin/catalog/master-registry');
    expect(catalogControllerSource).not.toContain('admin/catalog/master-candidates');
  });
});
