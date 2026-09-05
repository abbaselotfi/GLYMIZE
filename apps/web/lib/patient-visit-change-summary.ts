"use client";

import type {
  PatientHandoffLab,
  PatientHandoffMedication,
  PatientHandoffRecord,
} from "@glymize/contracts";

export type PatientVisitChangeItem =
  | {
      kind: "lab";
      key: string;
      label: string;
      previousValue: number;
      currentValue: number;
      unit: string;
      specimen?: string;
    }
  | {
      kind: "vital";
      key: "weight" | "blood_pressure" | "pulse";
      label: string;
      previousValue: string;
      currentValue: string;
      unit: string;
    }
  | {
      kind: "medication";
      key: string;
      label: string;
      change: "added" | "removed" | "changed";
      previousValue?: string;
      currentValue?: string;
    };

export interface PatientVisitChangeSummary {
  previousAt: string;
  currentAt: string;
  changes: PatientVisitChangeItem[];
}

function normalizedText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function normalizedUnit(value: unknown) {
  return normalizedText(value)
    .replace(/[μµ]/g, "u")
    .replace(/\s+/g, "");
}

function comparableLabKey(lab: PatientHandoffLab) {
  const canonicalKey = normalizedText(lab.canonicalKey);
  const unit = normalizedUnit(lab.unit);
  const specimen = normalizedText(lab.specimen);
  if (!canonicalKey || !unit) return null;
  return `${canonicalKey}\u0000${unit}\u0000${specimen}`;
}

function uniqueConfirmedLabs(record: PatientHandoffRecord) {
  const groups = new Map<string, PatientHandoffLab[]>();
  for (const lab of record.labs) {
    if (
      lab.verification !== "confirmed" ||
      typeof lab.value !== "number" ||
      !Number.isFinite(lab.value)
    ) {
      continue;
    }
    const key = comparableLabKey(lab);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(lab);
    groups.set(key, group);
  }

  // Multiple same-key measurements inside one encounter are ambiguous for a
  // simple visit-to-visit delta. Do not silently pick one of them.
  return new Map(
    [...groups.entries()]
      .filter(([, group]) => group.length === 1)
      .map(([key, group]) => [key, group[0]!] as const),
  );
}

function medicationKey(medication: PatientHandoffMedication) {
  const id = normalizedText(medication.genericMedicationId);
  if (id) return `id:${id}`;
  const name = normalizedText(medication.genericName);
  return name ? `name:${name}` : null;
}

function uniqueConfirmedMedications(record: PatientHandoffRecord) {
  const groups = new Map<string, PatientHandoffMedication[]>();
  for (const medication of record.medications) {
    if (medication.verification !== "confirmed") continue;
    const key = medicationKey(medication);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(medication);
    groups.set(key, group);
  }
  return new Map(
    [...groups.entries()]
      .filter(([, group]) => group.length === 1)
      .map(([key, group]) => [key, group[0]!] as const),
  );
}

function medicationSignature(medication: PatientHandoffMedication) {
  return JSON.stringify({
    doseAmount:
      typeof medication.doseAmount === "number" &&
      Number.isFinite(medication.doseAmount)
        ? medication.doseAmount
        : null,
    doseUnit: normalizedUnit(medication.doseUnit) || null,
    frequencyPerDay:
      typeof medication.frequencyPerDay === "number" &&
      Number.isFinite(medication.frequencyPerDay)
        ? medication.frequencyPerDay
        : null,
    frequencyCode: normalizedText(medication.frequencyCode) || null,
    status: medication.status ?? null,
  });
}

function medicationDisplay(medication: PatientHandoffMedication) {
  const parts: string[] = [];
  if (
    typeof medication.doseAmount === "number" &&
    Number.isFinite(medication.doseAmount)
  ) {
    parts.push(
      `${medication.doseAmount}${medication.doseUnit ? ` ${medication.doseUnit}` : ""}`,
    );
  }
  if (
    typeof medication.frequencyPerDay === "number" &&
    Number.isFinite(medication.frequencyPerDay)
  ) {
    parts.push(`${medication.frequencyPerDay}×/day`);
  } else if (medication.frequencyCode) {
    parts.push(medication.frequencyCode);
  }
  if (medication.status) parts.push(medication.status);
  return parts.join(" · ") || "recorded";
}

function changedNumber(previous: unknown, current: unknown) {
  return (
    typeof previous === "number" &&
    Number.isFinite(previous) &&
    typeof current === "number" &&
    Number.isFinite(current) &&
    !Object.is(previous, current)
  );
}

/**
 * Deterministic presentation projection only. It reports exact recorded
 * differences and deliberately does not infer improvement, worsening,
 * causality, treatment intent, or clinical significance.
 */
export function buildPatientVisitChangeSummary(
  current: PatientHandoffRecord,
  previous: PatientHandoffRecord,
): PatientVisitChangeSummary {
  const changes: PatientVisitChangeItem[] = [];

  if (changedNumber(previous.vitals.weightKg, current.vitals.weightKg)) {
    changes.push({
      kind: "vital",
      key: "weight",
      label: "Weight",
      previousValue: String(previous.vitals.weightKg),
      currentValue: String(current.vitals.weightKg),
      unit: "kg",
    });
  }

  const bpComparable =
    typeof previous.vitals.systolicBp === "number" &&
    Number.isFinite(previous.vitals.systolicBp) &&
    typeof previous.vitals.diastolicBp === "number" &&
    Number.isFinite(previous.vitals.diastolicBp) &&
    typeof current.vitals.systolicBp === "number" &&
    Number.isFinite(current.vitals.systolicBp) &&
    typeof current.vitals.diastolicBp === "number" &&
    Number.isFinite(current.vitals.diastolicBp);
  if (
    bpComparable &&
    (
      previous.vitals.systolicBp !== current.vitals.systolicBp ||
      previous.vitals.diastolicBp !== current.vitals.diastolicBp
    )
  ) {
    changes.push({
      kind: "vital",
      key: "blood_pressure",
      label: "Blood pressure",
      previousValue: `${previous.vitals.systolicBp}/${previous.vitals.diastolicBp}`,
      currentValue: `${current.vitals.systolicBp}/${current.vitals.diastolicBp}`,
      unit: "mmHg",
    });
  }

  if (changedNumber(previous.vitals.pulseBpm, current.vitals.pulseBpm)) {
    changes.push({
      kind: "vital",
      key: "pulse",
      label: "Pulse",
      previousValue: String(previous.vitals.pulseBpm),
      currentValue: String(current.vitals.pulseBpm),
      unit: "bpm",
    });
  }

  const previousLabs = uniqueConfirmedLabs(previous);
  const currentLabs = uniqueConfirmedLabs(current);
  for (const [key, currentLab] of currentLabs) {
    const previousLab = previousLabs.get(key);
    if (!previousLab || previousLab.value === currentLab.value) continue;
    changes.push({
      kind: "lab",
      key,
      label: currentLab.canonicalName || currentLab.rawName || currentLab.canonicalKey!,
      previousValue: previousLab.value!,
      currentValue: currentLab.value!,
      unit: currentLab.unit!,
      ...(currentLab.specimen ? { specimen: currentLab.specimen } : {}),
    });
  }

  const previousMedications = uniqueConfirmedMedications(previous);
  const currentMedications = uniqueConfirmedMedications(current);
  const medicationKeys = new Set([
    ...previousMedications.keys(),
    ...currentMedications.keys(),
  ]);
  for (const key of medicationKeys) {
    const previousMedication = previousMedications.get(key);
    const currentMedication = currentMedications.get(key);
    if (previousMedication && !currentMedication) {
      changes.push({
        kind: "medication",
        key,
        label: previousMedication.genericName,
        change: "removed",
        previousValue: medicationDisplay(previousMedication),
      });
      continue;
    }
    if (!previousMedication && currentMedication) {
      changes.push({
        kind: "medication",
        key,
        label: currentMedication.genericName,
        change: "added",
        currentValue: medicationDisplay(currentMedication),
      });
      continue;
    }
    if (
      previousMedication &&
      currentMedication &&
      medicationSignature(previousMedication) !==
        medicationSignature(currentMedication)
    ) {
      changes.push({
        kind: "medication",
        key,
        label: currentMedication.genericName,
        change: "changed",
        previousValue: medicationDisplay(previousMedication),
        currentValue: medicationDisplay(currentMedication),
      });
    }
  }

  return {
    previousAt: previous.updatedAt,
    currentAt: current.updatedAt,
    changes,
  };
}
