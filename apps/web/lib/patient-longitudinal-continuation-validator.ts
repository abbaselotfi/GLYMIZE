import type { PatientLongitudinalReadModel } from "@glymize/contracts/patient-core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new Error("PATIENT_LONGITUDINAL_INVALID_RESPONSE");
}

export function validatePatientCoreCollectionContinuation(
  collection: unknown,
  expectedSourceVersion?: string,
  requireContinuation = false,
) {
  if (!isRecord(collection)) invalid();
  const continuation = collection.continuation;
  if (continuation === undefined) {
    if (requireContinuation) invalid();
    return;
  }
  if (!isRecord(continuation)) invalid();

  const sourceVersion = continuation.sourceVersion;
  const pageSize = continuation.pageSize;
  const hasMore = continuation.hasMore;
  const nextCursor = continuation.nextCursor;
  const remainingCount = continuation.remainingCount;
  if (
    typeof sourceVersion !== "string" ||
    !sourceVersion ||
    Number.isNaN(Date.parse(sourceVersion)) ||
    (expectedSourceVersion !== undefined && sourceVersion !== expectedSourceVersion) ||
    typeof pageSize !== "number" ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 200 ||
    typeof hasMore !== "boolean" ||
    (hasMore && (typeof nextCursor !== "string" || !nextCursor)) ||
    (!hasMore && nextCursor !== undefined) ||
    (remainingCount !== undefined &&
      (typeof remainingCount !== "number" ||
        !Number.isInteger(remainingCount) ||
        remainingCount < 0))
  ) {
    invalid();
  }

  if (hasMore && collection.completeness === "complete") invalid();

  const diagnostics = collection.diagnostics;
  if (diagnostics !== undefined) {
    if (!isRecord(diagnostics)) invalid();
    const counts = [
      "sourceRowCount",
      "eligibleCount",
      "includedCount",
      "intentionallyExcludedCount",
      "invalidSkippedCount",
      "truncatedCount",
    ] as const;
    for (const name of counts) {
      const value = diagnostics[name];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) invalid();
    }
    if (
      diagnostics.sourceRowCount !==
        Number(diagnostics.eligibleCount) + Number(diagnostics.intentionallyExcludedCount) ||
      diagnostics.eligibleCount !==
        Number(diagnostics.includedCount) +
          Number(diagnostics.invalidSkippedCount) +
          Number(diagnostics.truncatedCount) ||
      (remainingCount !== undefined && remainingCount !== diagnostics.truncatedCount) ||
      (Number(diagnostics.truncatedCount) > 0) !== hasMore
    ) {
      invalid();
    }
    if (
      collection.completeness === "complete" &&
      (Number(diagnostics.invalidSkippedCount) > 0 || Number(diagnostics.truncatedCount) > 0)
    ) {
      invalid();
    }
  }
}

export function validatePatientLongitudinalContinuations(
  model: PatientLongitudinalReadModel,
) {
  validatePatientCoreCollectionContinuation(
    model.context.observations,
    model.generatedAt,
  );
  validatePatientCoreCollectionContinuation(model.timeline, model.generatedAt);
  return model;
}
