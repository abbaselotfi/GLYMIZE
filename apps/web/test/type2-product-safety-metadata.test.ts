import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  listReviewSets: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock("@glymize/clinical-engine", () => ({
  listType2ReviewedProductSafetyReviewSetsV2: mocks.listReviewSets,
}));

import { loadType2ReviewedProductSafetyReviewSetsV2 } from "../lib/type2-product-safety-metadata";

const reviewedSet = {
  reviewSetId: "WEGOVY-MASH-SAFETY",
  reviewSetVersion: "2026-06-18",
  masterDrugId: "WD-SEMAGLUTIDE",
  productIdentity: { brandName: "WEGOVY", route: "subcutaneous" },
  criteria: [{
    criterionId: "wegovy.men2",
    label: "Multiple Endocrine Neoplasia syndrome type 2 (MEN 2)",
    promptFa: "آیا بیمار مبتلا به سندرم نئوپلازی متعدد غدد درون‌ریز نوع ۲ (MEN 2) است؟",
    presentMeaning: "present means reviewed label contraindication",
    effect: "exclude_if_present",
    evidence: [],
  }],
  reviewState: "approved",
  evidence: [],
};

describe("Type 2 reviewed product-safety metadata loader", () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.listReviewSets.mockReset();
  });

  it("bootstraps the browser-owned catalogue before reading runtime review-set metadata", async () => {
    mocks.apiFetch.mockResolvedValue(new Response("[]", { status: 200 }));
    mocks.listReviewSets.mockReturnValue([reviewedSet]);

    await expect(loadType2ReviewedProductSafetyReviewSetsV2()).resolves.toEqual([reviewedSet]);
    expect(mocks.apiFetch).toHaveBeenCalledWith("/v1/catalog/generics");
    expect(mocks.apiFetch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listReviewSets.mock.invocationCallOrder[0]!,
    );
  });

  it("does not expose stale/fabricated fallback metadata when catalogue bootstrap fails", async () => {
    mocks.apiFetch.mockResolvedValue(new Response("{}", { status: 503 }));

    await expect(loadType2ReviewedProductSafetyReviewSetsV2()).resolves.toEqual([]);
    expect(mocks.listReviewSets).not.toHaveBeenCalled();
  });
});
