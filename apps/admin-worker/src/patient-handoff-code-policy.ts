export type PatientHandoffWriteMode = "create" | "update";

export function resolvePatientHandoffWriteMode(
  value: unknown,
): PatientHandoffWriteMode | null {
  if (value === undefined || value === null || value === "") {
    return "create";
  }
  return value === "create" || value === "update"
    ? value
    : null;
}

export function buildSequentialFileCodeCandidates(
  value: string,
  limit = 128,
) {
  const code = value.trim();
  if (!/^\d+$/.test(code) || code.length > 64) {
    return [] as string[];
  }

  const requested = Number.isFinite(limit)
    ? Math.trunc(limit)
    : 128;
  const count = Math.max(1, Math.min(128, requested));
  const width = code.length;
  let current = BigInt(code);
  const candidates: string[] = [];

  for (let index = 0; index < count; index += 1) {
    current += 1n;
    candidates.push(
      current.toString().padStart(width, "0"),
    );
  }

  return candidates;
}
