export const AI_MODELS_KV_SCHEMA_VERSION = 1 as const;

interface AiModelsKvEnvelopeV1 {
  schemaVersion: typeof AI_MODELS_KV_SCHEMA_VERSION;
  models: unknown[];
}

export interface ParsedAiModelsKvPayload<T> {
  models: T[];
  migratedFromLegacy: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAiModelsKvPayload<T>(
  raw: string,
  isValidModel: (value: unknown) => value is T,
): ParsedAiModelsKvPayload<T> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Backward compatibility for the pre-envelope payload already stored under
  // ai:models:v1. It is read only as an explicit legacy shape; all new writes
  // use the versioned envelope below.
  if (Array.isArray(parsed)) {
    return {
      models: parsed.filter(isValidModel),
      migratedFromLegacy: true,
    };
  }

  if (!isRecord(parsed) || parsed.schemaVersion !== AI_MODELS_KV_SCHEMA_VERSION || !Array.isArray(parsed.models)) {
    return null;
  }

  const envelope = parsed as unknown as AiModelsKvEnvelopeV1;
  return {
    models: envelope.models.filter(isValidModel),
    migratedFromLegacy: false,
  };
}

export function serializeAiModelsKvPayload<T>(models: readonly T[]): string {
  return JSON.stringify({
    schemaVersion: AI_MODELS_KV_SCHEMA_VERSION,
    models,
  });
}
