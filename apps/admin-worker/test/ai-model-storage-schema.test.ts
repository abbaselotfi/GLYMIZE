import { describe, expect, it } from "vitest";
import {
  AI_MODELS_KV_SCHEMA_VERSION,
  parseAiModelsKvPayload,
  serializeAiModelsKvPayload,
} from "../src/ai-model-storage";

type Model = { id: string };
const validModel = (value: unknown): value is Model =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "string";

describe("AI model KV schema boundary", () => {
  it("reads the legacy raw array without inventing unsupported models", () => {
    expect(parseAiModelsKvPayload(JSON.stringify([{ id: "ok" }, { nope: true }]), validModel)).toEqual({
      models: [{ id: "ok" }],
      migratedFromLegacy: true,
    });
  });

  it("writes and reads the current versioned envelope", () => {
    const raw = serializeAiModelsKvPayload([{ id: "one" }, { id: "two" }]);
    expect(JSON.parse(raw)).toEqual({
      schemaVersion: AI_MODELS_KV_SCHEMA_VERSION,
      models: [{ id: "one" }, { id: "two" }],
    });
    expect(parseAiModelsKvPayload(raw, validModel)).toEqual({
      models: [{ id: "one" }, { id: "two" }],
      migratedFromLegacy: false,
    });
  });

  it("fails closed for malformed or explicit future envelopes", () => {
    expect(parseAiModelsKvPayload("not-json", validModel)).toBeNull();
    expect(parseAiModelsKvPayload(JSON.stringify({ schemaVersion: 1, models: {} }), validModel)).toBeNull();
    expect(parseAiModelsKvPayload(JSON.stringify({ schemaVersion: 2, models: [{ id: "future" }] }), validModel)).toBeNull();
  });
});
