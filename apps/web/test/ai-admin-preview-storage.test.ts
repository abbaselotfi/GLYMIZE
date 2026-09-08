import { describe, expect, it } from "vitest";
import {
  AI_ADMIN_PREVIEW_SCHEMA_VERSION,
  parseAiAdminPreviewStorage,
  serializeAiAdminPreviewStorage,
} from "../lib/ai-admin-preview-storage";
import type { AdminAiModel } from "../lib/admin-auth";

const model: AdminAiModel = {
  id: "draft-1",
  name: "Preview model",
  provider: "workers_ai",
  enabled: true,
  role: "primary",
  priority: 1,
  accountId: "account",
  gatewayId: "gateway",
  modelId: "@cf/example/model",
  reasoningEffort: "low",
  maxCompletionTokens: 1000,
  timeoutMs: 45000,
  tokenConfigured: false,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

describe("AI admin local preview schema boundary", () => {
  it("writes the current versioned envelope", () => {
    const raw = serializeAiAdminPreviewStorage([model]);
    expect(JSON.parse(raw)).toEqual({
      schemaVersion: AI_ADMIN_PREVIEW_SCHEMA_VERSION,
      models: [model],
    });
  });

  it("reads the current envelope without migration", () => {
    expect(parseAiAdminPreviewStorage(serializeAiAdminPreviewStorage([model]))).toEqual({
      models: [model],
      migratedFromLegacy: false,
    });
  });

  it("migrates the legacy unwrapped array deterministically", () => {
    expect(parseAiAdminPreviewStorage(JSON.stringify([model]))).toEqual({
      models: [model],
      migratedFromLegacy: true,
    });
  });

  it("rejects future, malformed, and invalid model payloads", () => {
    expect(parseAiAdminPreviewStorage(JSON.stringify({ schemaVersion: 2, models: [model] }))).toBeNull();
    expect(parseAiAdminPreviewStorage("not-json")).toBeNull();
    expect(parseAiAdminPreviewStorage(JSON.stringify({ schemaVersion: 1, models: [{ ...model, provider: "other" }] }))).toBeNull();
  });

  it("never restores tokenConfigured=true from browser persistence", () => {
    const parsed = parseAiAdminPreviewStorage(JSON.stringify([{ ...model, tokenConfigured: true }]));
    expect(parsed?.models[0]?.tokenConfigured).toBe(false);
  });
});
