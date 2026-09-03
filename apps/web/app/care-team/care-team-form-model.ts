import type {
  PatientCodeKind,
  PatientHandoffClinicalFlags,
  PatientHandoffFieldProvenanceMap,
  PatientHandoffLab,
  PatientHandoffMedication,
  PatientReportedSex,
} from "@glymize/contracts";
import { LAB_MASTER_REGISTRY } from "@glymize/clinical-engine/lab-text-parser";

export type MedicationDraft = {
  id: string;
  genericName: string;
  doseAmount: string;
  doseUnit: string;
  frequencyPerDay: string;
  verification: "unverified" | "confirmed" | "rejected";
};

export const EMPTY_VITALS = {
  weightKg: "",
  heightCm: "",
  systolicBp: "",
  diastolicBp: "",
  pulseBpm: "",
};
export const EMPTY_FLAGS: PatientHandoffClinicalFlags = {};

export const LAB_DATALIST_OPTIONS = LAB_MASTER_REGISTRY.flatMap((test) =>
  [...new Set([test.name, test.faName, ...test.aliases])].map((alias) => ({
    key: `${test.canonicalKey}:${alias}`,
    value: alias,
    label: `${test.name} / ${test.faName} / ${test.defaultUnit ?? ""}`,
  })),
);

export function labObservationIdentity(lab: PatientHandoffLab) {
  return [
    lab.canonicalKey ?? lab.rawName.trim().toLowerCase(),
    lab.value ?? lab.valueText ?? "",
    lab.unit ?? "",
    lab.observedAt ?? "",
    lab.sourceDocumentName ?? "",
    lab.sourcePage ?? "",
  ].join("|");
}

const FREQUENCY_ALIASES: Record<string, { timesPerDay: number; code: string }> = {
  "1": { timesPerDay: 1, code: "OD" },
  OD: { timesPerDay: 1, code: "OD" },
  QD: { timesPerDay: 1, code: "OD" },
  Q24H: { timesPerDay: 1, code: "OD" },
  "2": { timesPerDay: 2, code: "BID" },
  BID: { timesPerDay: 2, code: "BID" },
  BD: { timesPerDay: 2, code: "BID" },
  Q12H: { timesPerDay: 2, code: "BID" },
  "3": { timesPerDay: 3, code: "TID" },
  TID: { timesPerDay: 3, code: "TID" },
  TDS: { timesPerDay: 3, code: "TID" },
  Q8H: { timesPerDay: 3, code: "TID" },
  "4": { timesPerDay: 4, code: "QID" },
  QID: { timesPerDay: 4, code: "QID" },
  QDS: { timesPerDay: 4, code: "QID" },
  Q6H: { timesPerDay: 4, code: "QID" },
};

function asciiMedicationFrequency(value: string) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const p = persian.indexOf(digit);
    if (p >= 0) return String(p);
    const a = arabic.indexOf(digit);
    return a >= 0 ? String(a) : digit;
  });
}

export function parseMedicationFrequency(value: string) {
  const normalized = asciiMedicationFrequency(value)
    .trim()
    .toUpperCase()
    .replace(/[\s._-]+/g, "");
  if (!normalized)
    return {
      timesPerDay: undefined as number | undefined,
      code: undefined as string | undefined,
      valid: true,
    };
  const alias = FREQUENCY_ALIASES[normalized];
  if (alias) return { ...alias, valid: true };
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0 && numeric <= 24) {
    const canonical = Object.values(FREQUENCY_ALIASES).find(
      (item) => item.timesPerDay === numeric,
    )?.code;
    return { timesPerDay: numeric, code: canonical ?? `${numeric}/DAY`, valid: true };
  }
  return { timesPerDay: undefined as number | undefined, code: normalized, valid: false };
}

export function frequencyInputFromStored(item: PatientHandoffMedication) {
  if (item.frequencyCode) return item.frequencyCode;
  if (item.frequencyPerDay === undefined) return "";
  const canonical = Object.values(FREQUENCY_ALIASES).find(
    (entry) => entry.timesPerDay === item.frequencyPerDay,
  )?.code;
  return canonical ?? String(item.frequencyPerDay);
}

export function numberOrUndefined(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? number : undefined;
}

export function newMedication(): MedicationDraft {
  return {
    id: crypto.randomUUID(),
    genericName: "",
    doseAmount: "",
    doseUnit: "mg",
    frequencyPerDay: "",
    verification: "unverified",
  };
}

export function newManualLab(): PatientHandoffLab {
  return {
    id: crypto.randomUUID(),
    rawName: "",
    value: undefined,
    valueText: undefined,
    unit: "",
    referenceRange: "",
    observedAt: "",
    verification: "unverified",
    sourceKind: "manual",
    sourceDocumentName: "manual-entry",
  };
}

export function labValueInput(lab: PatientHandoffLab) {
  if (lab.valueText !== undefined) return lab.valueText;
  if (lab.value !== undefined) return String(lab.value);
  return "";
}

export function isPersianCalendarDate(value?: string) {
  const normalized = (value ?? "").trim().replace(/[۰-۹٠-٩]/g, (digit) => {
    const persian = "۰۱۲۳۴۵۶۷۸۹";
    const arabic = "٠١٢٣٤٥٦٧٨٩";
    const p = persian.indexOf(digit);
    if (p >= 0) return String(p);
    const a = arabic.indexOf(digit);
    return a >= 0 ? String(a) : digit;
  });

  return /^(?:13|14)\d{2}[/-]\d{1,2}[/-]\d{1,2}$/.test(normalized);
}

export function labDateInputValue(value?: string) {
  const text = (value ?? "").trim();
  if (!text) return "";
  return isPersianCalendarDate(text) ? text : text.replace(/\//g, "-");
}

export function labNeedsReviewAttention(lab: PatientHandoffLab) {
  return (
    lab.verification === "unverified" &&
    lab.parserConfidence !== undefined &&
    lab.parserConfidence < 0.8
  );
}

export function draftFingerprint(input: {
  patientCodeKind: PatientCodeKind;
  patientCode: string;
  firstName: string;
  lastName: string;
  vitals: typeof EMPTY_VITALS;
  flags: PatientHandoffClinicalFlags;
  medications: MedicationDraft[];
  labs: PatientHandoffLab[];
  reportedAgeYears: string;
  reportedSex: PatientReportedSex | "";
  patientFieldProvenance: PatientHandoffFieldProvenanceMap;
  ocrText: string;
  nurseNotes: string;
}) {
  return JSON.stringify(
    {
      patientCodeKind: input.patientCodeKind,
      patientCode: input.patientCode,
      firstName: input.firstName,
      lastName: input.lastName,
      vitals: input.vitals,
      flags: Object.entries(input.flags)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
        .sort(),
      medications: input.medications,
      labs: input.labs,
      reportedAgeYears: input.reportedAgeYears,
      reportedSex: input.reportedSex,
      patientFieldProvenance: Object.entries(input.patientFieldProvenance).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
      ocrText: input.ocrText,
      nurseNotes: input.nurseNotes,
    },
    (key, value) => (key === "id" ? undefined : value),
  );
}

export function emptyDraftFingerprint() {
  return draftFingerprint({
    patientCodeKind: "file_number",
    patientCode: "",
    firstName: "",
    lastName: "",
    vitals: EMPTY_VITALS,
    flags: EMPTY_FLAGS,
    medications: [],
    labs: [],
    reportedAgeYears: "",
    reportedSex: "",
    patientFieldProvenance: {},
    ocrText: "",
    nurseNotes: "",
  });
}
