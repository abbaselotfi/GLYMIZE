import type {
  PatientEncounterClinicalSnapshot,
  PatientHandoffLab,
  PatientHandoffMedication,
  PatientLongitudinalSummary,
  VerificationState,
} from "@glymize/contracts";
import type {
  PatientClinicalContextView,
  PatientContextView,
  PatientCoreCollection,
  PatientCoreFactMeta,
  PatientCoreVerification,
  PatientMedicationStateView,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import type { PatientCoreEncounterSnapshotSource } from "./snapshot-reader";

function verification(value: VerificationState): PatientCoreVerification {
  if (value === "confirmed") return "verified";
  if (value === "rejected") return "rejected";
  return "unverified";
}

function normalizedKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function sourceMeta(
  source: PatientCoreEncounterSnapshotSource,
  practiceId: string,
  patientId: string,
  verificationState: PatientCoreVerification,
  effectiveAt?: string,
): PatientCoreFactMeta {
  return {
    scope: { practiceId, patientId },
    source: {
      sourceType: "patient_record_v2",
      recordType: "patient_encounter_snapshot",
      recordId: source.snapshotId,
      encounterId: source.encounterId,
    },
    effectiveAt: effectiveAt ?? source.encounterAt,
    recordedAt: source.createdAt,
    freshness: "unknown",
    verification: verificationState,
    revision: source.revision,
  };
}

function medicationDose(item: PatientHandoffMedication) {
  if (typeof item.doseAmount !== "number" || !Number.isFinite(item.doseAmount)) {
    return undefined;
  }
  return `${item.doseAmount}${item.doseUnit ? ` ${item.doseUnit.trim()}` : ""}`;
}

function medicationFrequency(item: PatientHandoffMedication) {
  if (item.frequencyCode?.trim()) return item.frequencyCode.trim();
  if (typeof item.frequencyPerDay === "number" && Number.isFinite(item.frequencyPerDay)) {
    return `${item.frequencyPerDay}/day`;
  }
  return undefined;
}

export function projectSnapshotMedications(
  source: PatientCoreEncounterSnapshotSource,
  practiceId: string,
  patientId: string,
): PatientCoreCollection<PatientMedicationStateView> {
  const medications = source.snapshot.medications;
  if (medications === undefined) {
    return {
      completeness: "not_available",
      gapReason: "not_collected",
      items: [],
      asOf: source.encounterAt,
    };
  }

  const items: PatientMedicationStateView[] = [];
  const occurrences = new Map<string, number>();
  let skippedInvalid = false;

  medications.forEach((medication, index) => {
    if (medication.verification === "rejected") return;
    const displayName = medication.genericName.trim();
    if (!displayName) {
      skippedInvalid = true;
      return;
    }
    const identity = medication.genericMedicationId?.trim() || normalizedKey(displayName);
    const baseKey = `medication:${identity}`;
    const occurrence = occurrences.get(baseKey) ?? 0;
    occurrences.set(baseKey, occurrence + 1);
    const factKey = occurrence === 0 ? baseKey : `${baseKey}#${occurrence + 1}`;
    const dose = medicationDose(medication);
    const frequency = medicationFrequency(medication);

    items.push({
      factId: `${source.snapshotId}:medication:${index}`,
      factKey,
      displayName,
      ...(medication.genericMedicationId?.trim()
        ? { medicationId: medication.genericMedicationId.trim() }
        : {}),
      status: medication.status ?? "uncertain",
      sourceState: "reconciled",
      adherence: "unknown",
      ...(dose ? { dose } : {}),
      ...(frequency ? { frequency } : {}),
      meta: sourceMeta(
        source,
        practiceId,
        patientId,
        verification(medication.verification),
      ),
    });
  });

  return {
    completeness: skippedInvalid ? "partial" : "complete",
    ...(skippedInvalid ? { gapReason: "other" as const } : {}),
    items,
    asOf: source.encounterAt,
  };
}

function labValue(lab: PatientHandoffLab) {
  if (typeof lab.value === "number" && Number.isFinite(lab.value)) return lab.value;
  if (lab.valueText?.trim()) return lab.valueText.trim();
  return undefined;
}

function labFactKey(lab: PatientHandoffLab) {
  const canonicalKey = lab.canonicalKey?.trim();
  if (!canonicalKey) return null;
  return `observation:${canonicalKey}:${lab.unit?.trim() ?? ""}:${lab.specimen?.trim() ?? ""}`;
}

export function projectSnapshotObservations(
  source: PatientCoreEncounterSnapshotSource,
  practiceId: string,
  patientId: string,
): PatientCoreCollection<PatientObservationView> {
  const labs = source.snapshot.labs;
  if (labs === undefined) {
    return {
      completeness: "not_available",
      gapReason: "not_collected",
      items: [],
      asOf: source.encounterAt,
    };
  }

  const latestByKey = new Map<string, PatientObservationView>();
  let skippedUnusable = false;

  labs.forEach((lab, index) => {
    if (lab.verification === "rejected") return;
    const factKey = labFactKey(lab);
    const value = labValue(lab);
    if (!factKey || value === undefined) {
      skippedUnusable = true;
      return;
    }
    const observedAt = lab.observedAt?.trim() || source.encounterAt;
    const displayName = lab.canonicalName?.trim() || lab.rawName.trim() || lab.canonicalKey!.trim();
    const item: PatientObservationView = {
      factId: lab.id || `${source.snapshotId}:lab:${index}`,
      factKey,
      displayName,
      value,
      ...(lab.unit?.trim() ? { unit: lab.unit.trim() } : {}),
      ...(lab.specimen?.trim() ? { specimen: lab.specimen.trim() } : {}),
      ...(lab.interpretation ? { abnormalFlag: lab.interpretation } : {}),
      observedAt,
      meta: sourceMeta(
        source,
        practiceId,
        patientId,
        verification(lab.verification),
        observedAt,
      ),
    };
    const existing = latestByKey.get(factKey);
    if (!existing || existing.observedAt.localeCompare(item.observedAt) <= 0) {
      latestByKey.set(factKey, item);
    }
  });

  return {
    completeness: skippedUnusable ? "partial" : "complete",
    ...(skippedUnusable ? { gapReason: "other" as const } : {}),
    items: [...latestByKey.values()].sort((left, right) =>
      left.factKey.localeCompare(right.factKey),
    ),
    asOf: source.encounterAt,
  };
}

const CLINICAL_FLAG_LABELS = {
  ascvd: "ASCVD",
  heartFailure: "Heart failure",
  ckd: "Chronic kidney disease",
  dialysis: "Dialysis",
  diabeticFoot: "Diabetic foot",
  masldMash: "MASLD/MASH",
  hypoglycemiaRisk: "Hypoglycemia risk",
} as const;

export function projectSnapshotClinicalContexts(
  source: PatientCoreEncounterSnapshotSource,
  practiceId: string,
  patientId: string,
): PatientCoreCollection<PatientClinicalContextView> {
  const flags = source.snapshot.clinicalFlags;
  if (flags === undefined) {
    return {
      completeness: "not_available",
      gapReason: "not_collected",
      items: [],
      asOf: source.encounterAt,
    };
  }

  const items: PatientClinicalContextView[] = [];
  for (const key of Object.keys(CLINICAL_FLAG_LABELS) as Array<keyof typeof CLINICAL_FLAG_LABELS>) {
    const value = flags[key];
    if (typeof value !== "boolean") continue;
    items.push({
      factId: `${source.snapshotId}:context:${key}`,
      factKey: `context:${key}`,
      displayName: CLINICAL_FLAG_LABELS[key],
      state: value ? "present" : "absent",
      meta: sourceMeta(source, practiceId, patientId, "verified"),
    });
  }

  return {
    // The legacy clinicalFlags object covers only a bounded subset of future
    // cross-cutting contexts, so absence of another context is not proof of absence.
    completeness: "partial",
    gapReason: "not_supported",
    items,
    asOf: source.encounterAt,
  };
}

export function projectSnapshotContext(
  patient: PatientLongitudinalSummary,
  practiceId: string,
  source: PatientCoreEncounterSnapshotSource,
): PatientContextView {
  const patientId = patient.patientId;
  return {
    schemaVersion: 1,
    generatedAt: source.createdAt,
    identity: {
      scope: { practiceId, patientId },
      patient,
    },
    allergies: {
      completeness: "not_available",
      gapReason: "source_not_exposed",
      items: [],
      asOf: source.encounterAt,
    },
    problems: {
      completeness: "not_available",
      gapReason: "source_not_exposed",
      items: [],
      asOf: source.encounterAt,
    },
    medications: projectSnapshotMedications(source, practiceId, patientId),
    observations: projectSnapshotObservations(source, practiceId, patientId),
    clinicalContexts: projectSnapshotClinicalContexts(source, practiceId, patientId),
  };
}

export function emptyPatientContext(
  patient: PatientLongitudinalSummary,
  practiceId: string,
  generatedAt: string,
): PatientContextView {
  const unavailable = <T>(): PatientCoreCollection<T> => ({
    completeness: "not_available",
    gapReason: "not_collected",
    items: [],
  });
  return {
    schemaVersion: 1,
    generatedAt,
    identity: {
      scope: { practiceId, patientId: patient.patientId },
      patient,
    },
    allergies: unavailable(),
    problems: unavailable(),
    medications: unavailable(),
    observations: unavailable(),
    clinicalContexts: unavailable(),
  };
}

export function snapshotHasAnyClinicalPayload(snapshot: PatientEncounterClinicalSnapshot) {
  return Boolean(
    snapshot.medications ||
    snapshot.labs ||
    snapshot.clinicalFlags ||
    snapshot.vitals ||
    snapshot.demographics,
  );
}
