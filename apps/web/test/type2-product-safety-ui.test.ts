import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type2ProductSafetyResponseStateV2,
  updateType2ProductSafetyScreensV2,
  type Type2ProductSafetyScreenV2,
  type Type2ReviewedProductSafetyReviewSetV2,
} from "../app/type-2/type2-product-safety-ui";
import {
  emptyType2StructuredIntakeDraft,
  structuredClinicalContextFromDraft,
} from "../app/type-2/type2-structured-intake-ui";

const evidence = {
  sourceId: "TEST-LABEL",
  title: "Reviewed test label",
  version: "2026-01-01",
  url: "https://example.test/label",
  locator: "Contraindications 4",
  strength: "regulatory_label" as const,
};

const reviewSet: Type2ReviewedProductSafetyReviewSetV2 = {
  reviewSetId: "WEGOVY-MASH-SAFETY",
  reviewSetVersion: "2026-06-18",
  masterDrugId: "MASTER-SEMAGLUTIDE-SC",
  productIdentity: { brandName: "WEGOVY", route: "subcutaneous" },
  criteria: [
    {
      criterionId: "wegovy.men2",
      label: "MEN 2",
      promptFa: "آیا بیمار MEN 2 دارد؟",
      presentMeaning: "Present means the reviewed contraindication is represented.",
      effect: "exclude_if_present",
      evidence: [evidence],
    },
    {
      criterionId: "wegovy.severe_gastroparesis",
      label: "Severe gastroparesis",
      promptFa: "آیا بیمار گاستروپارزی شدید دارد؟",
      presentMeaning: "Present blocks reviewed product execution.",
      effect: "block_execution_if_present",
      evidence: [evidence],
    },
  ],
  reviewState: "approved",
  evidence: [evidence],
};

function screen(
  patch: Partial<Type2ProductSafetyScreenV2> = {},
): Type2ProductSafetyScreenV2 {
  return {
    masterDrugId: reviewSet.masterDrugId,
    reviewSetId: reviewSet.reviewSetId,
    reviewSetVersion: reviewSet.reviewSetVersion,
    responses: [],
    ...patch,
  };
}

describe("Type 2 product-specific safety UI transport", () => {
  it("does not fabricate unknown or absent when a criterion is unanswered", () => {
    const untouched = updateType2ProductSafetyScreensV2(
      [],
      reviewSet,
      "wegovy.men2",
      undefined,
    );
    expect(untouched).toEqual([]);
    expect(type2ProductSafetyResponseStateV2([], reviewSet, "wegovy.men2")).toBeUndefined();
  });

  it("carries only explicit Present, Absent, or Unknown states in the exact versioned envelope", () => {
    const present = updateType2ProductSafetyScreensV2([], reviewSet, "wegovy.men2", "present");
    expect(present).toEqual([{
      masterDrugId: reviewSet.masterDrugId,
      reviewSetId: reviewSet.reviewSetId,
      reviewSetVersion: reviewSet.reviewSetVersion,
      responses: [{ criterionId: "wegovy.men2", state: "present" }],
    }]);

    const withUnknown = updateType2ProductSafetyScreensV2(
      present,
      reviewSet,
      "wegovy.severe_gastroparesis",
      "unknown",
    );
    expect(type2ProductSafetyResponseStateV2(withUnknown, reviewSet, "wegovy.severe_gastroparesis")).toBe("unknown");

    const removed = updateType2ProductSafetyScreensV2(withUnknown, reviewSet, "wegovy.men2", undefined);
    expect(removed[0]?.responses).toEqual([
      { criterionId: "wegovy.severe_gastroparesis", state: "unknown" },
    ]);
  });

  it("never migrates a stale review-set version into the current version", () => {
    const stale = screen({
      reviewSetVersion: "2025-OLD",
      responses: [{ criterionId: "wegovy.men2", state: "absent" }],
    });
    const next = updateType2ProductSafetyScreensV2(
      [stale],
      reviewSet,
      "wegovy.severe_gastroparesis",
      "absent",
    );

    expect(next).toEqual([{
      masterDrugId: reviewSet.masterDrugId,
      reviewSetId: reviewSet.reviewSetId,
      reviewSetVersion: reviewSet.reviewSetVersion,
      responses: [{ criterionId: "wegovy.severe_gastroparesis", state: "absent" }],
    }]);
    expect(next[0]?.responses).not.toContainEqual({ criterionId: "wegovy.men2", state: "absent" });
  });

  it("projects explicit screens only while the MASH pathway is active", () => {
    const explicit = updateType2ProductSafetyScreensV2([], reviewSet, "wegovy.men2", "absent");
    const draft = { ...emptyType2StructuredIntakeDraft, productSafetyScreens: explicit };

    const active = structuredClinicalContextFromDraft(draft, {
      factors: ["masld_mash"],
      worldDrugDomains: [],
    });
    expect(active.productSafetyScreens).toEqual(explicit);
    expect(active.productSafetyScreens).not.toBe(explicit);

    const inactive = structuredClinicalContextFromDraft(draft, {
      factors: [],
      worldDrugDomains: [],
    });
    expect(inactive.productSafetyScreens).toBeUndefined();
  });

  it("filters empty envelopes instead of claiming a completed screen", () => {
    const active = structuredClinicalContextFromDraft({
      ...emptyType2StructuredIntakeDraft,
      productSafetyScreens: [screen()],
    }, {
      factors: ["masld_mash"],
      worldDrugDomains: [],
    });
    expect(active.productSafetyScreens).toBeUndefined();
  });
});

describe("Type 2 product-specific safety field surface", () => {
  const structuredSource = readFileSync(
    fileURLToPath(new URL("../app/type-2/type2-structured-context-fields.tsx", import.meta.url)),
    "utf8",
  );
  const productSafetySource = readFileSync(
    fileURLToPath(new URL("../app/type-2/type2-product-safety-fields.tsx", import.meta.url)),
    "utf8",
  );

  it("mounts the reviewed product-safety panel only from the MASH structured boundary", () => {
    expect(structuredSource).toContain('factors.includes("masld_mash")');
    expect(structuredSource).toContain("<Type2ProductSafetyFields");
    expect(productSafetySource).toContain("loadType2ReviewedProductSafetyReviewSetsV2");
    expect(productSafetySource).toContain('data-testid="type2-product-safety-screen"');
  });

  it("keeps not-answered distinct from explicit unknown and states the no-clearance guardrail", () => {
    expect(productSafetySource).toContain('value="">');
    expect(productSafetySource).toContain('value="present"');
    expect(productSafetySource).toContain('value="absent"');
    expect(productSafetySource).toContain('value="unknown"');
    expect(productSafetySource).toContain("Not answered sends no fact");
    expect(productSafetySource).toContain("not global product clearance");
  });
});
