import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MasterDrugRegistryEntry } from "@glymize/contracts";
import { buildDecisionGraphInventoryFromContractsV2 } from "../src/index.js";

type CatalogueClass = "ace_inhibitor" | "arb" | "statin" | "mra";

type MultidomainScopeEntry = {
  canonicalName: string;
  aliases: string[];
  clinicalDomains: string[];
  catalogueClass: CatalogueClass;
};

type MultidomainScope = {
  schemaVersion: 1;
  entries: MultidomainScopeEntry[];
};

const scope = JSON.parse(
  readFileSync(
    new URL("../../../tools/iran-drug-runner/scope_multidomain_allowlist.json", import.meta.url),
    "utf8",
  ),
) as MultidomainScope;

const therapyGroupByClass = {
  ace_inhibitor: "raas_blocker",
  arb: "raas_blocker",
  statin: "lipid_lowering",
  mra: "mineralocorticoid_receptor_antagonist",
} as const;

const drugClassByClass = {
  ace_inhibitor: "ACE inhibitor",
  arb: "Angiotensin II receptor blocker (ARB)",
  statin: "Statin lipid-lowering therapy",
  mra: "Mineralocorticoid receptor antagonist",
} as const;

const therapeuticAreaByDomain: Record<string, string> = {
  hypertension: "Hypertension",
  ckd: "CKD",
  cardiovascular: "Cardiovascular",
  heart_failure: "Heart failure",
  lipids: "Lipids",
};

const laneByDomain = {
  hypertension: "hypertension",
  ckd: "kidney",
  heart_failure: "heart_failure",
  lipids: "lipids",
} as const;

function masterEntry(entry: MultidomainScopeEntry, index: number): MasterDrugRegistryEntry {
  return {
    id: `PHASE4-${String(index + 1).padStart(2, "0")}`,
    canonicalName: entry.canonicalName,
    persianName: entry.aliases.find((alias) => /[آ-ی]/.test(alias)) ?? entry.canonicalName,
    searchSynonyms: entry.aliases,
    combination: false,
    therapeuticAreas: entry.clinicalDomains.map(
      (domain) => therapeuticAreaByDomain[domain] ?? domain,
    ),
    drugClass: drugClassByClass[entry.catalogueClass],
    primaryIndications: entry.clinicalDomains.map(
      (domain) => therapeuticAreaByDomain[domain] ?? domain,
    ),
    guidelineRole: "Phase 4 multi-domain catalogue classification fixture",
    clinicalEffects: [],
    sourceCodes: ["PHASE4-CATALOGUE-SCOPE"],
    sourceUrls: ["https://glymize.ir/architecture/phase4-catalogue"],
    reviewState: "approved",
  };
}

describe("Phase 4 multidomain catalogue coverage", () => {
  it("contains the approved ACEi, ARB, statin, finerenone, and spironolactone scope", () => {
    expect(scope.schemaVersion).toBe(1);
    expect(scope.entries).toHaveLength(25);
    expect(new Set(scope.entries.map((entry) => entry.canonicalName)).size).toBe(
      scope.entries.length,
    );

    const classes = new Set(scope.entries.map((entry) => entry.catalogueClass));
    expect(classes).toEqual(new Set(["ace_inhibitor", "arb", "statin", "mra"]));
    expect(scope.entries.some((entry) => entry.canonicalName === "Finerenone")).toBe(true);
    expect(scope.entries.some((entry) => entry.canonicalName === "Spironolactone")).toBe(true);
  });

  it("classifies every admitted product into the expected RAAS, MRA, or lipid group and clinical lanes", () => {
    const registry = scope.entries.map(masterEntry);
    const built = buildDecisionGraphInventoryFromContractsV2({
      masterRegistry: registry,
      marketProducts: [],
    });

    expect(built.inventory.knowledge).toHaveLength(scope.entries.length);

    const byName = new Map(
      built.inventory.knowledge.map((medication) => [medication.genericName, medication]),
    );

    for (const entry of scope.entries) {
      const medication = byName.get(entry.canonicalName);
      expect(medication, `${entry.canonicalName} must be present in Decision Graph knowledge`).toBeDefined();
      expect(medication?.therapyGroup).toBe(therapyGroupByClass[entry.catalogueClass]);

      for (const domain of entry.clinicalDomains) {
        const expectedLane = laneByDomain[domain as keyof typeof laneByDomain];
        if (expectedLane) {
          expect(
            medication?.primaryLanes,
            `${entry.canonicalName} must retain ${domain} domain classification`,
          ).toContain(expectedLane);
        }
      }
    }
  });
});
