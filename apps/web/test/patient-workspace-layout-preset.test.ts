import fs from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = fs.readFileSync(
  new URL("../app/records/page.tsx", import.meta.url),
  "utf8",
);
const layoutSource = fs.readFileSync(
  new URL("../app/records/patient-workspace-layout.tsx", import.meta.url),
  "utf8",
);
const layoutCss = fs.readFileSync(
  new URL("../app/records/patient-workspace-layout.module.css", import.meta.url),
  "utf8",
);
const recordsCss = fs.readFileSync(
  new URL("../app/records/records.module.css", import.meta.url),
  "utf8",
);
const profileSource = fs.readFileSync(
  new URL("../app/profile/page.tsx", import.meta.url),
  "utf8",
);

describe("Patient Workspace layout preset reuse", () => {
  it("reuses the existing runtime profile preference instead of creating another preference store", () => {
    expect(pageSource).toContain("<PatientWorkspaceLayout>");
    expect(layoutSource).toContain("getRuntimeProfile");
    expect(layoutSource).toContain("profile.layoutPreset");
    expect(layoutSource).toContain('useState<LayoutPreset>("auto")');
    expect(layoutSource).toContain("data-patient-workspace-layout={layoutPreset}");
    expect(layoutSource).not.toContain("localStorage");
    expect(layoutSource).not.toContain("sessionStorage");
    expect(layoutSource).not.toContain("updateRuntimeProfile");
  });

  it("supports the same four profile presets with presentation-only mappings", () => {
    for (const preset of [
      "auto",
      "command_center",
      "focused_workflow",
      "compact_cards",
    ]) {
      expect(profileSource).toContain(`key: "${preset}"`);
    }

    expect(layoutCss).toContain('[data-patient-workspace-layout="focused_workflow"]');
    expect(layoutCss).toContain('[data-patient-workspace-layout="compact_cards"]');
    expect(layoutCss).toContain('[data-patient-workspace-layout="command_center"]');
    expect(layoutCss).toContain("--patient-workspace-columns");
    expect(layoutCss).toContain("--patient-workspace-max-width");
    expect(recordsCss).toContain("var(--patient-workspace-columns");
    expect(recordsCss).toContain("var(--patient-workspace-max-width");
  });

  it("fails safely to Auto presentation and never becomes clinical or data authority", () => {
    expect(layoutSource).toContain(".catch(() => {");
    expect(layoutSource).not.toContain("runtimeFetch");
    expect(layoutSource).not.toContain("clinical-engine");
    expect(layoutSource).not.toContain("PatientWorkspaceSnapshot");
    expect(layoutSource).not.toContain("orders");
    expect(layoutSource).not.toContain("medications");
  });

  it("preserves the responsive single-column safety boundary on narrower screens", () => {
    expect(layoutCss).toContain("@media (max-width: 980px)");
    expect(layoutCss).toContain("--patient-workspace-columns: minmax(0, 1fr)");
    expect(recordsCss).toContain("@media(max-width:980px)");
    expect(recordsCss).toContain(".layout{grid-template-columns:1fr}");
  });
});
