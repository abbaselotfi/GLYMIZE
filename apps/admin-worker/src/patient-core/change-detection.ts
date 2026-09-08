import type {
  PatientAllergyIntoleranceView,
  PatientChange,
  PatientChangeAnchor,
  PatientChangeFamily,
  PatientChangeFamilyCoverage,
  PatientChangeFieldDelta,
  PatientChangeScalar,
  PatientChangeSet,
  PatientClinicalContextView,
  PatientContextView,
  PatientCoreCollection,
  PatientCoreFactBase,
  PatientMedicationStateView,
  PatientObservationView,
  PatientProblemView,
} from "@glymize/contracts/patient-core";

type ComparableFamily = Exclude<
  PatientChangeFamily,
  "patient_status" | "event"
>;
type ComparableFact =
  | PatientAllergyIntoleranceView
  | PatientProblemView
  | PatientMedicationStateView
  | PatientObservationView
  | PatientClinicalContextView;

const FAMILIES: ComparableFamily[] = [
  "allergy",
  "problem",
  "medication",
  "observation",
  "clinical_context",
];

function collectionFor(
  view: PatientContextView,
  family: ComparableFamily,
): PatientCoreCollection<ComparableFact> {
  if (family === "allergy") return view.allergies as PatientCoreCollection<ComparableFact>;
  if (family === "problem") return view.problems as PatientCoreCollection<ComparableFact>;
  if (family === "medication") return view.medications as PatientCoreCollection<ComparableFact>;
  if (family === "observation") return view.observations as PatientCoreCollection<ComparableFact>;
  return view.clinicalContexts as PatientCoreCollection<ComparableFact>;
}

function scalar(value: unknown): PatientChangeScalar {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function comparableFields(
  family: ComparableFamily,
  fact: ComparableFact,
): Record<string, PatientChangeScalar> {
  if (family === "allergy") {
    const item = fact as PatientAllergyIntoleranceView;
    return {
      category: item.category,
      status: item.status,
      criticality: item.criticality,
      substanceKey: scalar(item.substanceKey),
      medicationId: scalar(item.medicationId),
    };
  }
  if (family === "problem") {
    const item = fact as PatientProblemView;
    return {
      status: item.status,
      codingSystem: scalar(item.coding?.system),
      codingCode: scalar(item.coding?.code),
      onsetAt: scalar(item.onsetAt),
      resolvedAt: scalar(item.resolvedAt),
    };
  }
  if (family === "medication") {
    const item = fact as PatientMedicationStateView;
    return {
      medicationId: scalar(item.medicationId),
      status: item.status,
      sourceState: item.sourceState,
      adherence: item.adherence,
      dose: scalar(item.dose),
      route: scalar(item.route),
      frequency: scalar(item.frequency),
      indication: scalar(item.indication),
    };
  }
  if (family === "observation") {
    const item = fact as PatientObservationView;
    return {
      value: item.value,
      unit: scalar(item.unit),
      specimen: scalar(item.specimen),
      abnormalFlag: scalar(item.abnormalFlag),
    };
  }
  const item = fact as PatientClinicalContextView;
  return {
    state: item.state,
    value: scalar(item.value),
  };
}

function fieldDeltas(
  family: ComparableFamily,
  before: ComparableFact,
  after: ComparableFact,
) {
  const left = comparableFields(family, before);
  const right = comparableFields(family, after);
  const deltas: PatientChangeFieldDelta[] = [];
  for (const field of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
    if (left[field] === right[field]) continue;
    deltas.push({
      field,
      before: left[field] ?? null,
      after: right[field] ?? null,
    });
  }
  return deltas;
}

function indexFacts(items: ComparableFact[]) {
  const map = new Map<string, ComparableFact>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (map.has(item.factKey)) duplicates.add(item.factKey);
    else map.set(item.factKey, item);
  }
  for (const key of duplicates) map.delete(key);
  return { map, duplicates };
}

function coverageFor(
  family: ComparableFamily,
  baseline: PatientCoreCollection<ComparableFact>,
  current: PatientCoreCollection<ComparableFact>,
  duplicateKeys: boolean,
): PatientChangeFamilyCoverage {
  if (
    baseline.completeness === "not_available" ||
    current.completeness === "not_available"
  ) {
    return {
      family,
      state: "omitted",
      reason: baseline.gapReason ?? current.gapReason ?? "source_not_available",
    };
  }
  if (
    duplicateKeys ||
    baseline.completeness === "partial" ||
    current.completeness === "partial"
  ) {
    return {
      family,
      state: "partial",
      reason: duplicateKeys ? "duplicate_fact_keys" : "partial_source_coverage",
    };
  }
  return { family, state: "complete" };
}

function changeId(family: ComparableFamily, kind: PatientChange["kind"], factKey: string) {
  return `${family}:${kind}:${factKey}`;
}

function compareFamily(
  family: ComparableFamily,
  baseline: PatientCoreCollection<ComparableFact>,
  current: PatientCoreCollection<ComparableFact>,
) {
  const left = indexFacts(baseline.items);
  const right = indexFacts(current.items);
  const coverage = coverageFor(
    family,
    baseline,
    current,
    left.duplicates.size > 0 || right.duplicates.size > 0,
  );
  if (coverage.state === "omitted") return { coverage, changes: [] as PatientChange[] };

  const changes: PatientChange[] = [];
  const commonKeys = [...left.map.keys()].filter((key) => right.map.has(key)).sort();
  for (const key of commonKeys) {
    const before = left.map.get(key)!;
    const after = right.map.get(key)!;
    const deltas = fieldDeltas(family, before, after);
    if (!deltas.length) continue;
    changes.push({
      changeId: changeId(family, "changed", key),
      family,
      kind: "changed",
      subjectKey: key,
      displayName: after.displayName,
      effectiveAt: after.meta.effectiveAt,
      source: after.meta.source,
      deltas,
    });
  }

  // Add/remove assertions require complete coverage on both sides. For partial
  // sources we still report deterministic changes to facts explicitly present
  // in both snapshots, but never infer presence/absence from silence.
  if (coverage.state === "complete") {
    for (const key of [...right.map.keys()].filter((key) => !left.map.has(key)).sort()) {
      const after = right.map.get(key)!;
      changes.push({
        changeId: changeId(family, "added", key),
        family,
        kind: "added",
        subjectKey: key,
        displayName: after.displayName,
        effectiveAt: after.meta.effectiveAt,
        source: after.meta.source,
      });
    }
    for (const key of [...left.map.keys()].filter((key) => !right.map.has(key)).sort()) {
      const before = left.map.get(key)!;
      changes.push({
        changeId: changeId(family, "removed", key),
        family,
        kind: "removed",
        subjectKey: key,
        displayName: before.displayName,
        effectiveAt: before.meta.effectiveAt,
        source: before.meta.source,
      });
    }
  }

  return { coverage, changes };
}

export function unavailablePatientChangeSet(
  current: PatientContextView,
  currentAnchor: PatientChangeAnchor | undefined,
  generatedAt: string,
): PatientChangeSet {
  return {
    schemaVersion: 1,
    scope: current.identity.scope,
    generatedAt,
    comparisonStatus: "unavailable",
    ...(currentAnchor ? { current: currentAnchor } : {}),
    coverage: FAMILIES.map((family) => ({
      family,
      state: "omitted" as const,
      reason: "no_previous_encounter_snapshot",
    })),
    changes: [],
  };
}

export function comparePatientContexts(
  baseline: PatientContextView,
  current: PatientContextView,
  baselineAnchor: PatientChangeAnchor,
  currentAnchor: PatientChangeAnchor,
  generatedAt: string,
): PatientChangeSet {
  if (
    baseline.identity.scope.practiceId !== current.identity.scope.practiceId ||
    baseline.identity.scope.patientId !== current.identity.scope.patientId
  ) {
    throw new Error("PATIENT_CORE_SCOPE_MISMATCH");
  }

  const coverage: PatientChangeFamilyCoverage[] = [];
  const changes: PatientChange[] = [];
  for (const family of FAMILIES) {
    const result = compareFamily(
      family,
      collectionFor(baseline, family),
      collectionFor(current, family),
    );
    coverage.push(result.coverage);
    changes.push(...result.changes);
  }

  return {
    schemaVersion: 1,
    scope: current.identity.scope,
    generatedAt,
    comparisonStatus: coverage.every((entry) => entry.state === "complete")
      ? "complete"
      : "partial",
    baseline: baselineAnchor,
    current: currentAnchor,
    coverage,
    changes: changes.sort((left, right) =>
      left.family.localeCompare(right.family) ||
      left.subjectKey.localeCompare(right.subjectKey) ||
      left.kind.localeCompare(right.kind),
    ),
  };
}
