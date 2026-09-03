import { describe, expect, it } from "vitest";

import { apiFetch } from "../lib/api-client";

describe("api-client browser-owned routing", () => {
  it("returns a structured 404 for an unknown local API route", async () => {
    const response = await apiFetch("/v1/admin/catalog/not-a-real-route");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "مسیر محلی شناخته نشد.",
    });
  });
});
