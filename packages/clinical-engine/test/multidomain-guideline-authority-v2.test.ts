import { describe, expect, it } from "vitest";
import {
  activeGuidelineSources,
  bundledClinicalRulePack,
  validateClinicalRulePack,
} from "../src/index.js";

const requiredSourceIds = [
  "ada-cvd-2026",
  "ada-ckd-2026",
  "ada-microvascular-2026",
  "ada-pregnancy-2026",
  "acc-aha-htn-2025",
  "acc-aha-dyslipidemia-2026",
  "aha-acc-hfsa-hf-2022",
  "acc-hfref-2024",
  "aasld-resmetirom-2024",
  "aasld-semaglutide-mash-2025",
] as const;

const authorityByClinicalNeed = {
  hypertension: ["ada-cvd-2026", "acc-aha-htn-2025"],
  lipids_and_statins: ["ada-cvd-2026", "acc-aha-dyslipidemia-2026"],
  ckd_and_finerenone: ["ada-ckd-2026", "kdigo-ckd-2024", "kdigo-dmckd-2022"],
  heart_failure_and_spironolactone: ["aha-acc-hfsa-hf-2022", "acc-hfref-2024"],
  neuropathy_and_retinopathy: ["ada-microvascular-2026"],
  pregnancy_medication_safety: ["ada-pregnancy-2026"],
  mash_pharmacotherapy: ["easl-masld-2024", "aasld-resmetirom-2024", "aasld-semaglutide-mash-2025"],
} as const;

describe("multidomain guideline authority", () => {
  it("registers each reviewed multidomain source exactly once and keeps it monitored", () => {
    const ids = activeGuidelineSources.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const sourceId of requiredSourceIds) {
      const source = activeGuidelineSources.find((item) => item.id === sourceId);
      expect(source, `${sourceId} must be registered`).toBeDefined();
      expect(source?.monitored).toBe(true);
      expect(source?.engineInfluence).toBe(true);
      expect(source?.sourceUrl.startsWith("https://")).toBe(true);
      expect(source?.engineDomains.length).toBeGreaterThan(0);
    }
  });

  it("provides explicit evidence authority for every Phase 4 multidomain medication family", () => {
    const registered = new Set(activeGuidelineSources.map((source) => source.id));
    for (const [need, sourceIds] of Object.entries(authorityByClinicalNeed)) {
      for (const sourceId of sourceIds) {
        expect(registered.has(sourceId), `${need} is missing ${sourceId}`).toBe(true);
      }
    }
  });

  it("includes registered source versions in the approved rule-pack provenance without auto-authoring executable rules", () => {
    expect(validateClinicalRulePack(bundledClinicalRulePack)).toEqual([]);
    for (const sourceId of requiredSourceIds) {
      expect(bundledClinicalRulePack.sourceVersions[sourceId]).toBeTruthy();
    }

    const executableRuleSourceIds = new Set(
      bundledClinicalRulePack.rules.flatMap((rule) => rule.sourceIds),
    );
    for (const sourceId of requiredSourceIds) {
      expect(executableRuleSourceIds.has(sourceId), `${sourceId} must not auto-activate merely by registry insertion`).toBe(false);
    }
  });
});
