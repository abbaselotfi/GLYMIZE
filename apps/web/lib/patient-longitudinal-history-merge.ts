import type {
  PatientCoreCollectionDiagnostics,
  PatientCoreEventView,
  PatientLongitudinalHistoryPage,
  PatientLongitudinalReadModel,
  PatientObservationView,
} from "@glymize/contracts/patient-core";

function sourceVersionFor(
  model: PatientLongitudinalReadModel,
  family: "observations" | "timeline",
) {
  return family === "observations"
    ? model.context.observations.continuation?.sourceVersion
    : model.timeline.continuation?.sourceVersion;
}

function assertSameTraversal(
  model: PatientLongitudinalReadModel,
  page: PatientLongitudinalHistoryPage,
) {
  const expected = sourceVersionFor(model, page.family);
  const received = page.collection.continuation.sourceVersion;
  if (!expected || expected !== received) {
    throw new Error("PATIENT_LONGITUDINAL_HISTORY_SOURCE_MISMATCH");
  }
}

function assertNoDuplicateIds<T>(
  existing: T[],
  incoming: T[],
  identity: (item: T) => string,
) {
  const seen = new Set(existing.map(identity));
  for (const item of incoming) {
    const id = identity(item);
    if (seen.has(id)) {
      throw new Error("PATIENT_LONGITUDINAL_HISTORY_DUPLICATE");
    }
    seen.add(id);
  }
}

function mergeObservationDiagnostics(
  existing: PatientCoreCollectionDiagnostics | undefined,
  page: PatientCoreCollectionDiagnostics | undefined,
  remainingCount: number | undefined,
) {
  if (!existing || !page) return existing;
  const truncatedCount = remainingCount ?? Math.max(
    0,
    existing.truncatedCount - page.includedCount - page.invalidSkippedCount,
  );
  const merged: PatientCoreCollectionDiagnostics = {
    ...existing,
    includedCount: existing.includedCount + page.includedCount,
    invalidSkippedCount: existing.invalidSkippedCount + page.invalidSkippedCount,
    truncatedCount,
  };
  if (
    merged.sourceRowCount !==
      merged.eligibleCount + merged.intentionallyExcludedCount ||
    merged.eligibleCount !==
      merged.includedCount + merged.invalidSkippedCount + merged.truncatedCount
  ) {
    throw new Error("PATIENT_LONGITUDINAL_HISTORY_ACCOUNTING_MISMATCH");
  }
  return merged;
}

function observationSort(left: PatientObservationView, right: PatientObservationView) {
  return right.observedAt.localeCompare(left.observedAt) ||
    (right.meta.recordedAt ?? "").localeCompare(left.meta.recordedAt ?? "") ||
    right.factId.localeCompare(left.factId);
}

function timelineSort(left: PatientCoreEventView, right: PatientCoreEventView) {
  return right.effectiveAt.localeCompare(left.effectiveAt) ||
    left.eventId.localeCompare(right.eventId);
}

export function mergePatientLongitudinalHistoryPage(
  model: PatientLongitudinalReadModel,
  page: PatientLongitudinalHistoryPage,
): PatientLongitudinalReadModel {
  if (
    page.scope.practiceId !== model.context.identity.scope.practiceId ||
    page.scope.patientId !== model.context.identity.scope.patientId
  ) {
    throw new Error("PATIENT_LONGITUDINAL_HISTORY_SCOPE_MISMATCH");
  }
  assertSameTraversal(model, page);

  if (page.family === "observations") {
    const existing = model.context.observations;
    assertNoDuplicateIds(existing.items, page.collection.items, (item) => item.factId);
    const items = [...existing.items, ...page.collection.items].sort(observationSort);
    const diagnostics = mergeObservationDiagnostics(
      existing.diagnostics,
      page.collection.diagnostics,
      page.collection.continuation.remainingCount,
    );
    const completeness = diagnostics
      ? diagnostics.invalidSkippedCount > 0 || diagnostics.truncatedCount > 0
        ? "partial"
        : "complete"
      : existing.completeness;
    const { gapReason: _oldGapReason, ...existingWithoutGap } = existing;

    return {
      ...model,
      context: {
        ...model.context,
        observations: {
          ...existingWithoutGap,
          completeness,
          ...(completeness === "partial" ? { gapReason: "other" as const } : {}),
          items,
          ...(diagnostics ? { diagnostics } : {}),
          continuation: page.collection.continuation,
        },
      },
    };
  }

  const existing = model.timeline;
  assertNoDuplicateIds(existing.items, page.collection.items, (item) => item.eventId);
  return {
    ...model,
    timeline: {
      ...existing,
      items: [...existing.items, ...page.collection.items].sort(timelineSort),
      continuation: page.collection.continuation,
    },
  };
}
