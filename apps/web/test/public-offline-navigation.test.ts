import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicDocumentPath } from "../lib/public-offline-navigation";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("explicit public document navigation", () => {
  it.each(["/", "/type-1", "/type-2/", "/pregnancy", "/offline", "/offline/"])("accepts %s", (href) => {
    expect(publicDocumentPath(href)).toBe(href.endsWith("/") ? href : `${href}/`);
  });
  it.each(["/patients/?patientId=a", "/dashboard", "/admin", "/type-2?patientId=a", "https://other.test/type-2", "//other.test/", "/type-2/extra"])("excludes %s", (href) => {
    expect(publicDocumentPath(href)).toBeNull();
  });
  it("uses scoped anchors with native target/rel semantics for an enabled build", async () => {
    vi.stubEnv("NEXT_PUBLIC_OFFLINE_BUNDLE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/GLYMIZE");
    vi.resetModules();
    const { default: Link } = await import("../app/components/public-document-link");
    expect(renderToStaticMarkup(createElement(Link, { href: "/type-2", target: "_blank", rel: "noreferrer" }, "T2"))).toBe('<a target="_blank" rel="noreferrer" href="/GLYMIZE/type-2/">T2</a>');
  });
});
