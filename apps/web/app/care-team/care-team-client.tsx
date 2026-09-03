"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  PatientCodeKind,
  PatientHandoffClinicalFlags,
  PatientHandoffCodeStatus,
  PatientHandoffFieldProvenanceMap,
  PatientHandoffLab,
  PatientHandoffMedication,
  PatientHandoffStructuredField,
  PatientHandoffVitals,
  PatientReportedSex,
} from "@glymize/contracts";
import {
  LAB_MASTER_REGISTRY,
  normalizeLabUnit,
  resolveLabMasterEntry,
} from "@glymize/clinical-engine/lab-text-parser";
import {
  recognizeClinicalDocument,
  type OcrPatientFieldSuggestion,
  type OcrProgress,
} from "../../lib/client-ocr";
import {
  checkCareTeamPatientCode,
  lookupPatientHandoff,
  PatientHandoffCodeConflictError,
  saveCareTeamPatientRecord,
  validateIranianNationalId,
} from "../../lib/care-team-record-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./care-team.module.css";

type MedicationDraft = {
  id: string;
  genericName: string;
  doseAmount: string;
  doseUnit: string;
  frequencyPerDay: string;
  verification: "unverified" | "confirmed" | "rejected";
};

const EMPTY_VITALS = { weightKg: "", heightCm: "", systolicBp: "", diastolicBp: "", pulseBpm: "" };
const EMPTY_FLAGS: PatientHandoffClinicalFlags = {};

const LAB_DATALIST_OPTIONS = LAB_MASTER_REGISTRY.flatMap(
  (test) =>
    [...new Set([test.name, test.faName, ...test.aliases])].map(
      (alias) => ({
        key: `${test.canonicalKey}:${alias}`,
        value: alias,
        label: `${test.name} / ${test.faName} / ${test.defaultUnit ?? ""}`,
      }),
    ),
);

function labObservationIdentity(lab: PatientHandoffLab) {
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
  "OD": { timesPerDay: 1, code: "OD" },
  "QD": { timesPerDay: 1, code: "OD" },
  "Q24H": { timesPerDay: 1, code: "OD" },
  "2": { timesPerDay: 2, code: "BID" },
  "BID": { timesPerDay: 2, code: "BID" },
  "BD": { timesPerDay: 2, code: "BID" },
  "Q12H": { timesPerDay: 2, code: "BID" },
  "3": { timesPerDay: 3, code: "TID" },
  "TID": { timesPerDay: 3, code: "TID" },
  "TDS": { timesPerDay: 3, code: "TID" },
  "Q8H": { timesPerDay: 3, code: "TID" },
  "4": { timesPerDay: 4, code: "QID" },
  "QID": { timesPerDay: 4, code: "QID" },
  "QDS": { timesPerDay: 4, code: "QID" },
  "Q6H": { timesPerDay: 4, code: "QID" },
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

function parseMedicationFrequency(value: string) {
  const normalized = asciiMedicationFrequency(value).trim().toUpperCase().replace(/[\s._-]+/g, "");
  if (!normalized) return { timesPerDay: undefined as number | undefined, code: undefined as string | undefined, valid: true };
  const alias = FREQUENCY_ALIASES[normalized];
  if (alias) return { ...alias, valid: true };
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0 && numeric <= 24) {
    const canonical = Object.values(FREQUENCY_ALIASES).find((item) => item.timesPerDay === numeric)?.code;
    return { timesPerDay: numeric, code: canonical ?? `${numeric}/DAY`, valid: true };
  }
  return { timesPerDay: undefined as number | undefined, code: normalized, valid: false };
}

function frequencyInputFromStored(item: PatientHandoffMedication) {
  if (item.frequencyCode) return item.frequencyCode;
  if (item.frequencyPerDay === undefined) return "";
  const canonical = Object.values(FREQUENCY_ALIASES).find((entry) => entry.timesPerDay === item.frequencyPerDay)?.code;
  return canonical ?? String(item.frequencyPerDay);
}


function numberOrUndefined(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? number : undefined;
}

function newMedication(): MedicationDraft {
  return { id: crypto.randomUUID(), genericName: "", doseAmount: "", doseUnit: "mg", frequencyPerDay: "", verification: "unverified" };
}


function newManualLab(): PatientHandoffLab {
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

function labValueInput(lab: PatientHandoffLab) {
  if (lab.valueText !== undefined) return lab.valueText;
  if (lab.value !== undefined) return String(lab.value);
  return "";
}

function isPersianCalendarDate(value?: string) {
  const normalized = (value ?? "")
    .trim()
    .replace(/[۰-۹٠-٩]/g, (digit) => {
      const persian = "۰۱۲۳۴۵۶۷۸۹";
      const arabic = "٠١٢٣٤٥٦٧٨٩";
      const p = persian.indexOf(digit);
      if (p >= 0) return String(p);
      const a = arabic.indexOf(digit);
      return a >= 0 ? String(a) : digit;
    });

  return /^(?:13|14)\d{2}[/-]\d{1,2}[/-]\d{1,2}$/.test(
    normalized,
  );
}

function labDateInputValue(value?: string) {
  const text = (value ?? "").trim();
  if (!text) return "";
  return isPersianCalendarDate(text)
    ? text
    : text.replace(/\//g, "-");
}

function labNeedsReviewAttention(lab: PatientHandoffLab) {
  return (
    lab.verification === "unverified" &&
    lab.parserConfidence !== undefined &&
    lab.parserConfidence < 0.8
  );
}

function draftFingerprint(input: {
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
      patientFieldProvenance: Object.entries(
        input.patientFieldProvenance,
      ).sort(([a], [b]) => a.localeCompare(b)),
      ocrText: input.ocrText,
      nurseNotes: input.nurseNotes,
    },
    (key, value) => key === "id" ? undefined : value,
  );
}

function emptyDraftFingerprint() {
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

export default function CareTeamClient() {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [patientCodeKind, setPatientCodeKind] = useState<PatientCodeKind>("file_number");
  const [patientCode, setPatientCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [reportedAgeYears, setReportedAgeYears] = useState("");
  const [reportedSex, setReportedSex] =
    useState<PatientReportedSex | "">("");
  const [patientFieldProvenance, setPatientFieldProvenance] =
    useState<PatientHandoffFieldProvenanceMap>({});
  const [patientFieldSuggestions, setPatientFieldSuggestions] =
    useState<OcrPatientFieldSuggestion[]>([]);
  const [vitals, setVitals] = useState(EMPTY_VITALS);
  const [flags, setFlags] = useState<PatientHandoffClinicalFlags>(EMPTY_FLAGS);
  const [medications, setMedications] = useState<MedicationDraft[]>([]);
  const [labs, setLabs] = useState<PatientHandoffLab[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [nurseNotes, setNurseNotes] = useState("");
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [newRecordPromptOpen, setNewRecordPromptOpen] = useState(false);
  const [fullNameReviewSuggestion, setFullNameReviewSuggestion] =
    useState<OcrPatientFieldSuggestion | null>(null);
  const [fullNameReviewFirstName, setFullNameReviewFirstName] = useState("");
  const [fullNameReviewLastName, setFullNameReviewLastName] = useState("");
  const [loadedRecordId, setLoadedRecordId] = useState<string | null>(null);
  const [patientCodeCollision, setPatientCodeCollision] =
    useState<PatientHandoffCodeStatus | null>(null);
  const [patientCodeCheckBusy, setPatientCodeCheckBusy] = useState(false);
  const patientCodeCheckRequestRef = useRef(0);
  const patientCodeInputRef = useRef<HTMLInputElement>(null);
  const savedDraftFingerprintRef = useRef(emptyDraftFingerprint());

  const nationalIdWarning = useMemo(() => patientCodeKind === "national_id" && patientCode.trim() && !validateIranianNationalId(patientCode), [patientCode, patientCodeKind]);

  function currentDraftFingerprint() {
    return draftFingerprint({
      patientCodeKind,
      patientCode,
      firstName,
      lastName,
      vitals,
      flags,
      medications,
      labs,
      reportedAgeYears,
      reportedSex,
      patientFieldProvenance,
      ocrText,
      nurseNotes,
    });
  }

  function clearPatientFieldProvenance(
    field: PatientHandoffStructuredField,
  ) {
    setPatientFieldProvenance((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateVital(key: keyof typeof EMPTY_VITALS, value: string) {
    setVitals((current) => ({ ...current, [key]: value }));
    if (key === "weightKg" || key === "heightCm") {
      clearPatientFieldProvenance(key);
    }
  }

  function suggestionProvenance(
    suggestion: OcrPatientFieldSuggestion,
  ) {
    return {
      sourceKind: suggestion.sourceKind,
      sourceDocumentName: suggestion.sourceDocumentName,
      sourcePage: suggestion.sourcePage,
      ocrConfidence: suggestion.ocrConfidence,
      parserConfidence: suggestion.parserConfidence,
      verification: "confirmed" as const,
    };
  }

  function setSuggestionProvenance(
    field: PatientHandoffStructuredField,
    suggestion: OcrPatientFieldSuggestion,
  ) {
    setPatientFieldProvenance((current) => ({
      ...current,
      [field]: suggestionProvenance(suggestion),
    }));
  }

  function splitReviewedFullName(value: string) {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 2) return null;
    return {
      firstName: parts[0]!,
      lastName: parts[1]!,
    };
  }

  function openFullNameReview(
    suggestion: OcrPatientFieldSuggestion,
  ) {
    const safeSplit = splitReviewedFullName(
      String(suggestion.value),
    );

    setFullNameReviewSuggestion(suggestion);
    setFullNameReviewFirstName(
      firstName || safeSplit?.firstName || "",
    );
    setFullNameReviewLastName(
      lastName || safeSplit?.lastName || "",
    );
  }

  function confirmFullNameReview() {
    const suggestion = fullNameReviewSuggestion;
    if (!suggestion) return;

    const reviewedFirstName = fullNameReviewFirstName.trim();
    const reviewedLastName = fullNameReviewLastName.trim();

    if (!reviewedFirstName || !reviewedLastName) {
      setStatus(
        fa
          ? "برای اعمال نام کامل، نام و نام خانوادگی را پس از تطبیق با برگه جداگانه وارد کنید."
          : "To apply the full name, enter reviewed first and last names separately.",
      );
      return;
    }

    setFirstName(reviewedFirstName);
    setLastName(reviewedLastName);
    setSuggestionProvenance("firstName", suggestion);
    setSuggestionProvenance("lastName", suggestion);
    setFullNameReviewSuggestion(null);
    setFullNameReviewFirstName("");
    setFullNameReviewLastName("");
    setStatus(
      fa
        ? "نام و نام خانوادگی پس از بازبینی اعمال شد."
        : "Reviewed first and last name were applied.",
    );
  }

  function isPatientSuggestionApplied(
    suggestion: OcrPatientFieldSuggestion,
  ) {
    const textValue = String(suggestion.value).trim();

    if (suggestion.field === "first_name") {
      return firstName.trim() === textValue;
    }
    if (suggestion.field === "last_name") {
      return lastName.trim() === textValue;
    }
    if (suggestion.field === "reported_age_years") {
      return reportedAgeYears.trim() === textValue;
    }
    if (suggestion.field === "reported_sex") {
      return reportedSex === textValue;
    }
    if (suggestion.field === "weight_kg") {
      return vitals.weightKg.trim() === textValue;
    }
    if (suggestion.field === "height_cm") {
      return vitals.heightCm.trim() === textValue;
    }
    if (suggestion.field === "national_id") {
      return (
        patientCodeKind === "national_id" &&
        patientCode.trim() === textValue
      );
    }
    if (suggestion.field === "full_name") {
      return Boolean(
        firstName.trim() &&
        lastName.trim() &&
        patientFieldProvenance.firstName?.sourceDocumentName ===
          suggestion.sourceDocumentName &&
        patientFieldProvenance.lastName?.sourceDocumentName ===
          suggestion.sourceDocumentName
      );
    }
    return false;
  }

  function applyPatientFieldSuggestion(
    suggestion: OcrPatientFieldSuggestion,
  ) {
    const textValue = String(suggestion.value).trim();

    if (suggestion.field === "first_name") {
      if (
        firstName.trim() &&
        firstName.trim() !== textValue
      ) {
        setStatus(
          fa
            ? "نام فعلی حفظ شد؛ برای جایگزینی، ابتدا فیلد نام را پاک یا دستی ویرایش کنید."
            : "Existing first name was preserved. Clear or edit it manually before replacing it.",
        );
        return;
      }
      setFirstName(textValue);
      setSuggestionProvenance("firstName", suggestion);
      return;
    }

    if (suggestion.field === "last_name") {
      if (
        lastName.trim() &&
        lastName.trim() !== textValue
      ) {
        setStatus(
          fa
            ? "نام خانوادگی فعلی حفظ شد؛ برای جایگزینی، ابتدا فیلد را پاک یا دستی ویرایش کنید."
            : "Existing last name was preserved. Clear or edit it manually before replacing it.",
        );
        return;
      }
      setLastName(textValue);
      setSuggestionProvenance("lastName", suggestion);
      return;
    }

    if (suggestion.field === "full_name") {
      const split = splitReviewedFullName(textValue);

      if (
        split &&
        !firstName.trim() &&
        !lastName.trim()
      ) {
        setFirstName(split.firstName);
        setLastName(split.lastName);
        setSuggestionProvenance("firstName", suggestion);
        setSuggestionProvenance("lastName", suggestion);
        return;
      }

      openFullNameReview(suggestion);
      return;
    }

    if (suggestion.field === "national_id") {
      if (patientCode.trim()) {
        setStatus(
          fa
            ? "شناسه فعلی بیمار حفظ شد. کد ملی OCR به‌طور خودکار جای شماره پرونده را نمی‌گیرد."
            : "The current patient identifier was preserved. OCR National ID will not silently replace a file number.",
        );
        return;
      }
      setPatientCodeKind("national_id");
      setPatientCode(textValue);
      setSuggestionProvenance("nationalId", suggestion);
      return;
    }

    if (suggestion.field === "reported_age_years") {
      if (
        reportedAgeYears.trim() &&
        reportedAgeYears.trim() !== textValue
      ) {
        setStatus(
          fa
            ? "سن فعلی حفظ شد؛ مقدار OCR خودکار جایگزین نشد."
            : "Existing age was preserved; OCR did not overwrite it.",
        );
        return;
      }
      setReportedAgeYears(textValue);
      setSuggestionProvenance(
        "reportedAgeYears",
        suggestion,
      );
      return;
    }

    if (suggestion.field === "reported_sex") {
      const nextSex: PatientReportedSex | "" =
        textValue === "male" || textValue === "female"
          ? textValue
          : "";

      if (!nextSex) return;

      if (
        reportedSex &&
        reportedSex !== nextSex
      ) {
        setStatus(
          fa
            ? "جنس گزارش‌شده فعلی حفظ شد؛ مقدار OCR خودکار جایگزین نشد."
            : "Existing reported sex was preserved; OCR did not overwrite it.",
        );
        return;
      }

      setReportedSex(nextSex);
      setSuggestionProvenance("reportedSex", suggestion);
      return;
    }

    if (suggestion.field === "weight_kg") {
      if (
        vitals.weightKg.trim() &&
        vitals.weightKg.trim() !== textValue
      ) {
        setStatus(
          fa
            ? "وزن فعلی حفظ شد؛ مقدار OCR خودکار جایگزین نشد."
            : "Existing weight was preserved; OCR did not overwrite it.",
        );
        return;
      }
      setVitals((current) => ({
        ...current,
        weightKg: textValue,
      }));
      setSuggestionProvenance("weightKg", suggestion);
      return;
    }

    if (suggestion.field === "height_cm") {
      if (
        vitals.heightCm.trim() &&
        vitals.heightCm.trim() !== textValue
      ) {
        setStatus(
          fa
            ? "قد فعلی حفظ شد؛ مقدار OCR خودکار جایگزین نشد."
            : "Existing height was preserved; OCR did not overwrite it.",
        );
        return;
      }
      setVitals((current) => ({
        ...current,
        heightCm: textValue,
      }));
      setSuggestionProvenance("heightCm", suggestion);
    }
  }

  function patientSuggestionLabel(
    suggestion: OcrPatientFieldSuggestion,
  ) {
    const labels: Record<OcrPatientFieldSuggestion["field"], string> = {
      first_name: fa ? "نام" : "First name",
      last_name: fa ? "نام خانوادگی" : "Last name",
      full_name: fa ? "نام کامل" : "Full name",
      national_id: fa ? "کد ملی" : "National ID",
      reported_age_years: fa ? "سن گزارش‌شده" : "Reported age",
      reported_sex: fa ? "جنس گزارش‌شده" : "Reported sex",
      weight_kg: fa ? "وزن" : "Weight",
      height_cm: fa ? "قد" : "Height",
    };
    return labels[suggestion.field];
  }

  function patientSuggestionValue(
    suggestion: OcrPatientFieldSuggestion,
  ) {
    if (suggestion.field === "reported_sex") {
      if (suggestion.value === "male") {
        return fa ? "مرد" : "Male";
      }
      if (suggestion.value === "female") {
        return fa ? "زن" : "Female";
      }
    }
    return String(suggestion.value);
  }

  function toggleFlag(key: keyof PatientHandoffClinicalFlags) {
    setFlags((current) => ({ ...current, [key]: !current[key] }));
  }

  function updateMedication(id: string, patch: Partial<MedicationDraft>) {
    setMedications((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function updateLab(id: string, patch: Partial<PatientHandoffLab>) {
    setLabs((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function updateLabName(id: string, value: string) {
    const match = resolveLabMasterEntry(value);

    setLabs((current) =>
      current.map((item) => {
        if (item.id !== id) return item;

        if (!match) {
          return {
            ...item,
            canonicalKey: undefined,
            rawName: value,
          };
        }

        const existingUnit = normalizeLabUnit(item.unit);
        const unit =
          existingUnit &&
          match.allowedUnits.includes(existingUnit)
            ? existingUnit
            : match.defaultUnit;

        return {
  ...item,
  canonicalKey: match.canonicalKey,
  canonicalName: match.name,
  rawName: value,
  specimen: match.specimens[0],
  unit,
};
      }),
    );
  }

  function updateLabValue(id: string, value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      updateLab(id, {
        value: undefined,
        valueText: undefined,
        parserConfidence: 1,
      });
      return;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      updateLab(id, {
        value: numeric,
        valueText: undefined,
        parserConfidence: 1,
      });
      return;
    }

    updateLab(id, {
      value: undefined,
      valueText: value,
      parserConfidence: 1,
    });
  }

  function addManualLab() {
    setLabs((current) => [...current, newManualLab()]);
  }


  function beginManualLabEntry() {
    setLabs((current) =>
      current.some((item) => item.sourceKind === "manual")
        ? current
        : [...current, newManualLab()],
    );
  }

function removeLab(id: string) {
    setLabs((current) => current.filter((item) => item.id !== id));
  }


  function hydrateFromRecord(
    record: import("@glymize/contracts").PatientHandoffRecord,
    code: string,
  ) {
    const nextVitals = {
      weightKg: record.vitals.weightKg !== undefined ? String(record.vitals.weightKg) : "",
      heightCm: record.vitals.heightCm !== undefined ? String(record.vitals.heightCm) : "",
      systolicBp: record.vitals.systolicBp !== undefined ? String(record.vitals.systolicBp) : "",
      diastolicBp: record.vitals.diastolicBp !== undefined ? String(record.vitals.diastolicBp) : "",
      pulseBpm: record.vitals.pulseBpm !== undefined ? String(record.vitals.pulseBpm) : "",
    };
    const nextReportedAgeYears =
      record.demographics?.reportedAgeYears !== undefined
        ? String(record.demographics.reportedAgeYears)
        : "";
    const nextReportedSex =
      record.demographics?.reportedSex ?? "";
    const nextPatientFieldProvenance =
      record.patientFieldProvenance ?? {};
    const nextFlags = record.clinicalFlags ?? {};
    const nextLabs = record.labs ?? [];
    const nextMedications = (record.medications ?? []).map((item) => ({
      id: crypto.randomUUID(),
      genericName: item.genericName,
      doseAmount: item.doseAmount !== undefined ? String(item.doseAmount) : "",
      doseUnit: item.doseUnit ?? "mg",
      frequencyPerDay: frequencyInputFromStored(item),
      verification: item.verification,
    }));
    const nextNurseNotes = record.nurseNotes ?? "";
    const nextOcrText = record.ocrText ?? "";

    setPatientCodeKind(record.patientCodeKind);
    setPatientCode(code);
    setFirstName(record.firstName ?? "");
    setLastName(record.lastName ?? "");
    setReportedAgeYears(nextReportedAgeYears);
    setReportedSex(nextReportedSex);
    setPatientFieldProvenance(nextPatientFieldProvenance);
    setPatientFieldSuggestions([]);
    setVitals(nextVitals);
    setFlags(nextFlags);
    setLabs(nextLabs);
    setMedications(nextMedications);
    setNurseNotes(nextNurseNotes);
    setOcrText(nextOcrText);
    setLoadedRecordId(record.id);
    setLoadedRevision(record.revision);

    savedDraftFingerprintRef.current = draftFingerprint({
      patientCodeKind: record.patientCodeKind,
      patientCode: code,
      firstName: record.firstName ?? "",
      lastName: record.lastName ?? "",
      vitals: nextVitals,
      flags: nextFlags,
      medications: nextMedications,
      labs: nextLabs,
      reportedAgeYears: nextReportedAgeYears,
      reportedSex: nextReportedSex,
      patientFieldProvenance: nextPatientFieldProvenance,
      ocrText: nextOcrText,
      nurseNotes: nextNurseNotes,
    });
  }

async function loadExisting(
  explicitCode?: string,
  explicitKind?: PatientCodeKind,
) {
  const code = (
    explicitCode ?? patientCode
  ).trim();
  const kind =
    explicitKind ?? patientCodeKind;

  if (!code) {
    setStatus(
      fa
        ? "برای باز کردن پرونده، کد بیمار را وارد کنید."
        : "Enter the patient code to open the existing handoff.",
    );
    return;
  }

  setBusy(true);
  try {
    const result = await lookupPatientHandoff(
      code,
      kind,
    );
    if (!result.found || !result.record) {
      setStatus(
        fa
          ? "پرونده‌ای با این کد پیدا نشد."
          : "No handoff was found for this patient code.",
      );
      return;
    }

    setPatientCodeCollision(null);
    hydrateFromRecord(result.record, code);
    setStatus(
      fa
        ? `پرونده نسخه ${result.record.revision} برای ویرایش باز شد. ذخیره بعدی فقط همین پرونده و همین نسخه را به‌روزرسانی می‌کند.`
        : `Revision ${result.record.revision} opened for editing. The next save may update only this loaded record and revision.`,
    );
  } catch (error) {
    const codeValue =
      error instanceof Error
        ? error.message
        : "LOOKUP_FAILED";
    setStatus(
      codeValue === "AMBIGUOUS_PATIENT_CODE"
        ? (
            fa
              ? "این کد در بیش از یک نوع شناسه وجود دارد."
              : "This code exists under more than one identifier type."
          )
        : codeValue === "HANDOFF_UNAUTHORIZED"
          ? (
              fa
                ? "توکن handoff با API هماهنگ نیست."
                : "The handoff token does not match the API."
            )
          : (
              fa
                ? "باز کردن پرونده انجام نشد."
                : "Could not open the existing handoff."
            ),
    );
  } finally {
    setBusy(false);
  }
}

  useEffect(() => {
    const pendingCode = window.sessionStorage.getItem("glymize:care-team-edit-code");
    if (!pendingCode) return;
    window.sessionStorage.removeItem("glymize:care-team-edit-code");
    setPatientCode(pendingCode);
    void loadExisting(pendingCode);
    // The handoff code is consumed once when this page opens from Type 2.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  function resetForNewRecord(nextStatus: string) {
    setPatientCodeKind("file_number");
    setPatientCode("");
    setFirstName("");
    setLastName("");
    setReportedAgeYears("");
    setReportedSex("");
    setPatientFieldProvenance({});
    setPatientFieldSuggestions([]);
    setVitals(EMPTY_VITALS);
    setFlags(EMPTY_FLAGS);
    setMedications([]);
    setLabs([]);
    setOcrText("");
    setNurseNotes("");
    setOcrProgress(null);
    setLoadedRecordId(null);
    setLoadedRevision(null);
    setPatientCodeCollision(null);
    setPatientCodeCheckBusy(false);
    patientCodeCheckRequestRef.current += 1;
    setNewRecordPromptOpen(false);
    setFullNameReviewSuggestion(null);
    setFullNameReviewFirstName("");
    setFullNameReviewLastName("");
    savedDraftFingerprintRef.current = emptyDraftFingerprint();
    setStatus(nextStatus);

    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestNewRecord() {
    if (busy) return;

    const hasUnsavedChanges =
      currentDraftFingerprint() !== savedDraftFingerprintRef.current;

    if (hasUnsavedChanges) {
      setNewRecordPromptOpen(true);
      return;
    }

    resetForNewRecord(
      fa
        ? "فرم برای پرونده بیمار جدید آماده شد."
        : "Ready for a new patient handoff.",
    );
  }

  function discardAndStartNew() {
    resetForNewRecord(
      fa
        ? "تغییرات ذخیره‌نشده کنار گذاشته شد؛ فرم پرونده جدید آماده است."
        : "Unsaved changes were discarded; the new patient form is ready.",
    );
  }

  async function saveAndStartNew() {
    setNewRecordPromptOpen(false);
    const saved = await save();
    if (!saved) return;

    resetForNewRecord(
      fa
        ? "پرونده قبلی ذخیره شد؛ فرم پرونده جدید آماده است."
        : "The previous handoff was saved; the new patient form is ready.",
    );
  }

async function checkPatientCodeAvailability() {
  if (
    busy ||
    loadedRevision !== null ||
    !patientCode.trim() ||
    nationalIdWarning
  ) {
    return;
  }

  const requestId =
    patientCodeCheckRequestRef.current + 1;
  patientCodeCheckRequestRef.current = requestId;
  const codeAtCheck = patientCode;
  const kindAtCheck = patientCodeKind;
  setPatientCodeCheckBusy(true);

  try {
    const result = await checkCareTeamPatientCode(
      codeAtCheck,
      kindAtCheck,
    );
    if (
      patientCodeCheckRequestRef.current !== requestId
    ) {
      return;
    }
    if (!result.available) {
      setPatientCodeCollision(result);
      setStatus(
        fa
          ? "این کد قبلاً برای یک پرونده ثبت شده است. پیش از ذخیره، پرونده موجود یا یک کد جدید را انتخاب کنید."
          : "This code is already assigned to a patient record. Choose the existing record or a new code before saving.",
      );
    }
  } catch {
    if (
      patientCodeCheckRequestRef.current === requestId
    ) {
      setStatus(
        fa
          ? "بررسی پیشگیرانه کد انجام نشد؛ هنگام ذخیره، سرور دوباره کد را به‌صورت اجباری کنترل می‌کند."
          : "The pre-save code check could not complete. The server will still enforce the code collision check on save.",
      );
    }
  } finally {
    if (
      patientCodeCheckRequestRef.current === requestId
    ) {
      setPatientCodeCheckBusy(false);
    }
  }
}

function useSuggestedPatientCode() {
  const suggestion =
    patientCodeCollision?.suggestion;
  if (!suggestion) return;

  patientCodeCheckRequestRef.current += 1;
  setPatientCodeKind("file_number");
  setPatientCode(suggestion.suggestedCode);
  setLoadedRecordId(null);
  setLoadedRevision(null);
  setPatientCodeCollision(null);
  setPatientCodeCheckBusy(false);
  clearPatientFieldProvenance("nationalId");
  setStatus(
    fa
      ? `شماره ${suggestion.suggestedCode} در زمان بررسی آزاد بود و برای این فرم انتخاب شد؛ هنگام ذخیره دوباره کنترل می‌شود.`
      : `File number ${suggestion.suggestedCode} was free when checked and is now selected; it will be checked again on save.`,
  );
}

function openExistingFromCollision() {
  const collision = patientCodeCollision;
  if (!collision) return;

  patientCodeCheckRequestRef.current += 1;
  setPatientCodeCollision(null);
  void loadExisting(
    patientCode,
    collision.patientCodeKind,
  );
}

  async function processFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setStatus("");
    setOcrProgress({ stage: "prepare", progress: 0, message: fa ? "آماده‌سازی فایل…" : "Preparing file…" });
    try {
      const result = await recognizeClinicalDocument(file, setOcrProgress);
      setOcrText((current) => [current, result.rawText].filter(Boolean).join("\n\n"));
      setPatientFieldSuggestions((current) => {
        const seen = new Set(
          current.map(
            (item) =>
              `${item.field}|${String(item.value)}|${item.sourceDocumentName}`,
          ),
        );
        const additions = result.patientFields.filter((item) => {
          const identity =
            `${item.field}|${String(item.value)}|${item.sourceDocumentName}`;
          if (seen.has(identity)) return false;
          seen.add(identity);
          return true;
        });
        return [...current, ...additions];
      });
      setLabs((current) => {
  const existing = new Set(
    current.map(labObservationIdentity),
  );
  const additions = result.labs.filter(
    (item) => !existing.has(labObservationIdentity(item)),
  );
  return [...current, ...additions];
});
      const headerOcrFa = result.patientHeaderOcrPages > 0
        ? ` · ${result.patientHeaderOcrPages} هدر بیمار OCR تصویری`
        : "";
      const headerOcrEn = result.patientHeaderOcrPages > 0
        ? ` · ${result.patientHeaderOcrPages} patient-header OCR`
        : "";
      const extractionModeFa = result.ocrPages > 0
        ? (result.embeddedTextPages > 0 ? ` · ${result.embeddedTextPages} صفحه متن PDF + ${result.ocrPages} صفحه OCR${headerOcrFa}` : ` · ${result.ocrPages} صفحه OCR${headerOcrFa}`)
        : (result.embeddedTextPages > 0 ? ` · متن ساختاری PDF${headerOcrFa}` : headerOcrFa);
      const extractionModeEn = result.ocrPages > 0
        ? (result.embeddedTextPages > 0 ? ` · ${result.embeddedTextPages} PDF text + ${result.ocrPages} OCR page(s)${headerOcrEn}` : ` · ${result.ocrPages} OCR page(s)${headerOcrEn}`)
        : (result.embeddedTextPages > 0 ? ` · embedded PDF text${headerOcrEn}` : headerOcrEn);
      setStatus(fa
        ? `${result.processedPageCount}${result.truncated ? ` از ${result.sourcePageCount}` : ""} صفحه/تصویر پردازش شد${result.truncated ? " (سقف ایمن پیش‌نمایش: ۱۰ صفحه)" : ""}${extractionModeFa}. مقادیر استخراج‌شده تا زمان تأیید شما وارد موتور درمان نمی‌شوند.`
        : `${result.processedPageCount}${result.truncated ? ` of ${result.sourcePageCount}` : ""} page(s)/image processed${result.truncated ? " (safe preview cap: 10 pages)" : ""}${extractionModeEn}. Extracted values remain excluded from the treatment engine until you confirm them.`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "OCR_FAILED";
      const message = code === "FILE_TOO_LARGE"
        ? (fa ? "حجم فایل بیش از ۱۸ مگابایت است." : "The file is larger than 18 MB.")
        : code === "UNSUPPORTED_FILE_TYPE"
          ? (fa ? "فقط PDF و تصویر پشتیبانی می‌شود." : "Only PDF and image files are supported.")
          : (fa ? "OCR انجام نشد. فایل، اتصال اینترنت برای مدل زبان یا سازگاری مرورگر را بررسی کنید." : "OCR failed. Check the file, language-model network access, or browser support.");
      setStatus(message);
    } finally {
      setBusy(false);
      setOcrProgress(null);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

async function save(): Promise<boolean> {
  if (!patientCode.trim()) {
    setStatus(
      fa
        ? "کد بیمار الزامی است."
        : "Patient code is required.",
    );
    return false;
  }
  if (nationalIdWarning) {
    setStatus(
      fa
        ? "کد ملی واردشده از نظر ساختار/رقم کنترل معتبر نیست؛ برای تست می‌توانید نوع کد را «شماره پرونده» انتخاب کنید."
        : "The national ID checksum is invalid. For synthetic testing, use File number instead.",
    );
    return false;
  }
  if (
    loadedRevision !== null &&
    !loadedRecordId
  ) {
    setStatus(
      fa
        ? "هدف ویرایش پرونده مشخص نیست؛ پرونده را دوباره با «باز کردن / ویرایش» باز کنید."
        : "The update target is missing. Re-open the record with Open / edit before saving.",
    );
    return false;
  }

  const fingerprintAtSaveStart =
    currentDraftFingerprint();
  setBusy(true);

  try {
    const mappedVitals: PatientHandoffVitals = {
      weightKg: numberOrUndefined(vitals.weightKg),
      heightCm: numberOrUndefined(vitals.heightCm),
      systolicBp: numberOrUndefined(
        vitals.systolicBp,
      ),
      diastolicBp: numberOrUndefined(
        vitals.diastolicBp,
      ),
      pulseBpm: numberOrUndefined(vitals.pulseBpm),
    };
    const mappedMeds: PatientHandoffMedication[] =
      medications
        .filter((item) => item.genericName.trim())
        .map((item) => ({
          genericName: item.genericName.trim(),
          doseAmount: numberOrUndefined(
            item.doseAmount,
          ),
          doseUnit: item.doseAmount.trim()
            ? item.doseUnit
            : undefined,
          frequencyPerDay:
            parseMedicationFrequency(
              item.frequencyPerDay,
            ).timesPerDay,
          frequencyCode:
            parseMedicationFrequency(
              item.frequencyPerDay,
            ).code,
          status: "active",
          verification: item.verification,
        }));

    const writeMode =
      loadedRevision === null
        ? "create" as const
        : "update" as const;

    const record = await saveCareTeamPatientRecord({
      patientCode,
      patientCodeKind,
      writeMode,
      ...(writeMode === "update"
        ? {
            expectedRecordId:
              loadedRecordId ?? undefined,
            expectedRevision: loadedRevision ?? undefined,
          }
        : {}),
      firstName,
      lastName,
      status: "ready_for_physician",
      demographics: {
        reportedAgeYears:
          numberOrUndefined(reportedAgeYears),
        reportedSex: reportedSex || undefined,
      },
      patientFieldProvenance,
      vitals: mappedVitals,
      clinicalFlags: flags,
      labs,
      medications: mappedMeds,
      nurseNotes,
      ocrText,
    });

    setLoadedRecordId(record.id);
    setLoadedRevision(record.revision);
    setPatientCodeCollision(null);
    savedDraftFingerprintRef.current =
      fingerprintAtSaveStart;
    setStatus(
      fa
        ? `پرونده برای پزشک آماده شد · نسخه ${record.revision} · کد نمایشی ${record.patientCodeDisplay}`
        : `Handoff ready for physician · revision ${record.revision} · ${record.patientCodeDisplay}`,
    );
    return true;
  } catch (error) {
    if (
      error instanceof PatientHandoffCodeConflictError
    ) {
      if (error.codeStatus) {
        setPatientCodeCollision(error.codeStatus);
      }
      setStatus(
        fa
          ? "ذخیره متوقف شد: این کد قبلاً به یک پرونده اختصاص داده شده است."
          : "Save stopped: this code is already assigned to an existing patient record.",
      );
      return false;
    }

    const code =
      error instanceof Error
        ? error.message
        : "SAVE_FAILED";
    setStatus(
      code === "HANDOFF_UNAUTHORIZED"
        ? (
            fa
              ? "توکن دسترسی handoff با API هماهنگ نیست."
              : "The handoff token does not match the API."
          )
        : code === "HANDOFF_API_NOT_CONFIGURED"
          ? (
              fa
                ? "API محلی handoff اجرا نشده است. برنامه را با start-local.ps1 اجرا کنید."
                : "The local handoff API is not running. Start GLYMIZE with start-local.ps1."
            )
          : code === "HANDOFF_API_UNREACHABLE"
            ? (
                fa
                  ? "ارتباط با API پرونده برقرار نشد؛ اتصال شبکه و آدرس Runtime API را بررسی کنید."
                  : "The patient-record API could not be reached. Check the network connection and Runtime API URL."
              )
            : code === "HANDOFF_RUNTIME_MISCONFIGURED"
              ? (
                  fa
                    ? "سرویس پرونده آماده نیست؛ اتصال پایگاه‌داده یا کلید رمزنگاری Runtime تنظیم نشده است."
                    : "The patient-record service is not ready. Its database binding or encryption key is not configured."
                )
              : code === "HANDOFF_API_INCOMPATIBLE"
                ? (
                    fa
                      ? "نسخه Runtime API از مسیر ذخیره پرونده پشتیبانی نمی‌کند؛ Worker باید به نسخه سازگار ارتقا یابد."
                      : "This Runtime API version does not support the patient-record save route. Upgrade the Worker to a compatible version."
                  )
                : code === "HANDOFF_RUNTIME_FAILED"
                  ? (
                      fa
                        ? "Runtime هنگام ذخیره پرونده با خطای داخلی مواجه شد؛ هیچ تأیید ذخیره‌ای دریافت نشد."
                        : "The Runtime failed while saving the record; no save confirmation was received."
                    )
          : code === "FILE_NUMBER_ALLOCATOR_UNINITIALIZED"
            ? (
                fa
                  ? "شماره‌دهی پرونده برای این مطب هنوز توسط پزشک راه‌اندازی نشده است؛ پیش از ثبت بیمار جدید، آخرین شماره پرونده باید تأیید شود."
                  : "File-number allocation has not been initialized by the physician for this practice. Confirm the latest assigned file number before creating a new patient."
              )
            : code === "ENCOUNTER_REVIEWED_ASSISTANT_LOCKED"
              ? (
                  fa
                    ? "این ویزیت توسط پزشک بازبینی شده و دیگر توسط دستیار قابل ویرایش نیست؛ برای مراجعه جدید یک پرونده ویزیت تازه ایجاد کنید."
                    : "This encounter has been reviewed by the physician and can no longer be edited by the assistant. Start a new encounter for a new visit."
                )
              : code === "HANDOFF_INPUT_INVALID"
            ? (
                fa
                  ? "شناسه بیمار یا هدف ویرایش معتبر نیست؛ نوع کد و وضعیت پرونده را بررسی کنید."
                  : "The patient identifier or update target is invalid; review the code and record state."
              )
            : code === "HANDOFF_REVISION_CONFLICT"
              ? (
                  fa
                    ? "این پرونده پس از باز شدن شما تغییر کرده است؛ برای جلوگیری از بازنویسی، دوباره آن را باز کنید."
                    : "This record changed after you opened it. Re-open it before saving to avoid overwriting a newer revision."
                )
              : code ===
                  "HANDOFF_UPDATE_TARGET_MISMATCH"
                ? (
                    fa
                      ? "کد یا هدف پرونده با پرونده بازشده تطابق ندارد؛ ذخیره متوقف شد."
                      : "The patient code no longer matches the loaded record; save was blocked."
                  )
                : (
                    fa
                      ? "ذخیره پرونده انجام نشد."
                      : "Could not save the patient handoff."
                  ),
    );
    return false;
  } finally {
    setBusy(false);
  }
}

  const progressPercent = ocrProgress ? Math.max(0, Math.min(100, Math.round(ocrProgress.progress * 100))) : 0;

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <div className={styles.topline}>
        <div className={styles.topLinks}>
          <Link href="/dashboard">
            {isRtl ? "\u2192" : "\u2190"} {fa ? "\u062f\u0627\u0634\u0628\u0648\u0631\u062f" : "Dashboard"}
          </Link>
          <Link href="/records">
            {fa ? "\u0622\u0631\u0634\u06cc\u0648 \u067e\u0631\u0648\u0646\u062f\u0647\u200c\u0647\u0627" : "Patient archive"}
          </Link>
        </div>
        <span>
          {fa
            ? "PRE-VISIT \u00b7 \u062f\u0627\u062f\u0647 \u0633\u0627\u062e\u062a\u0627\u0631\u06cc\u0627\u0641\u062a\u0647 \u0648 \u0642\u0627\u0628\u0644 \u0628\u0627\u0632\u0628\u06cc\u0646\u06cc"
            : "PRE-VISIT \u00b7 structured, reviewable data"}
        </span>
      </div>

      <header className={styles.hero}>
        <div>
          <span>GLYMIZE CARE TEAM</span>
          <h1>{fa ? "دستیار / پرستار" : "Assistant / nurse"}</h1>
          <p>{fa ? "اطلاعات بیمار را پیش از ویزیت جمع‌آوری کنید، برگه آزمایش را با عکس یا PDF بخوانید و فقط داده‌های تأییدشده را برای پزشک آماده کنید." : "Collect pre-visit data, read lab sheets from a mobile photo or PDF, and hand only reviewed data to the physician."}</p>
        </div>
        <div className={styles.safetyBadge}>{fa ? "OCR ≠ تأیید بالینی" : "OCR ≠ clinical verification"}</div>
      </header>

      <section className={styles.card}>
        <div className={styles.sectionTitle}><b>1</b><div><h2>{fa ? "شناسه بیمار" : "Patient identity"}</h2><p>{fa ? "نام و نام خانوادگی اختیاری است؛ کد بیمار کلید handoff است." : "Name is optional; the patient code is the handoff key."}</p></div></div>
        <div className={styles.grid3}>
          <label>
            <span>{fa ? "نوع کد" : "Code type"}</span>
            {patientCodeKind === "other" ? (
              <input
                value={fa ? "شناسه قدیمی (فقط سازگاری)" : "Legacy identifier (compatibility only)"}
                disabled
                className={styles.legacyCodeKind}
              />
            ) : (
              <select
                value={patientCodeKind}
                disabled={busy || loadedRevision !== null}
                onChange={(event) => {
                  patientCodeCheckRequestRef.current += 1;
                  setPatientCodeCollision(null);
                  setLoadedRecordId(null);
                  setLoadedRevision(null);
                  setPatientCodeKind(event.target.value as PatientCodeKind);
                  clearPatientFieldProvenance("nationalId");
                }}
              >
                <option value="file_number">
                  {fa ? "شماره پرونده" : "File number"}
                </option>
                <option value="national_id">
                  {fa ? "کد ملی" : "National ID"}
                </option>
              </select>
            )}
          </label>
          <label>
            <span>{fa ? "کد بیمار *" : "Patient code *"}</span>
            <div className={styles.patientCodeAction}>
              <input
                ref={patientCodeInputRef}
                value={patientCode}
                disabled={busy || loadedRevision !== null}
                onBlur={() => void checkPatientCodeAvailability()}
                onChange={(event) => {
                  patientCodeCheckRequestRef.current += 1;
                  setPatientCodeCollision(null);
                  setPatientCode(event.target.value);
                  setLoadedRecordId(null);
                  setLoadedRevision(null);
                  clearPatientFieldProvenance("nationalId");
                }}
                autoComplete="off"
                inputMode={patientCodeKind === "national_id" ? "numeric" : "text"}
              />
              <button type="button" disabled={busy || loadedRevision !== null} onClick={() => void loadExisting()}>
                {fa ? "باز کردن / ویرایش" : "Open / edit"}
              </button>
              <button
                type="button"
                disabled={busy}
                className={styles.inlineNewRecord}
                onClick={requestNewRecord}
              >
                + {fa ? "پرونده جدید" : "New patient"}
              </button>
            </div>
            {patientCodeCheckBusy && loadedRevision === null && (
              <small className={styles.patientCodeChecking}>
                {fa ? "در حال بررسی آزاد بودن کد…" : "Checking code availability…"}
              </small>
            )}
            {loadedRevision !== null && (
              <small className={styles.revisionBadge}>
                {fa ? `نسخه بازشده: ${loadedRevision}` : `Loaded revision: ${loadedRevision}`}
              </small>
            )}
          </label>
          <div className={styles.nameGrid}>
            <label>
              <span>{fa ? "نام (اختیاری)" : "First name (optional)"}</span>
              <input
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  clearPatientFieldProvenance("firstName");
                }}
              />
            </label>
            <label>
              <span>{fa ? "نام خانوادگی (اختیاری)" : "Last name (optional)"}</span>
              <input
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                  clearPatientFieldProvenance("lastName");
                }}
              />
            </label>
          </div>
        </div>
        {nationalIdWarning && <p className={styles.warning}>{fa ? "کد ملی فعلی checksum معتبر ندارد." : "The current national ID checksum is invalid."}</p>}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionTitle}><b>2</b><div><h2>{fa ? "ثبت نتایج آزمایش" : "Lab results"}</h2><p>{fa ? "از دوربین، PDF / JPG یا ثبت دستی استفاده کنید؛ هر نتیجه تا زمان تأیید در وضعیت بازبینی می‌ماند." : "Use camera, PDF/JPG, or manual entry; every result remains in review until explicitly confirmed."}</p></div></div>
        <div className={styles.uploadActions}>
          <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()}>📷 {fa ? "عکس با موبایل" : "Take photo"}</button>
          <button type="button" disabled={busy} className={styles.secondary} onClick={() => fileRef.current?.click()}>PDF / JPG {fa ? "انتخاب فایل" : "Choose file"}</button>
          <button
            type="button"
            disabled={busy}
            className={styles.secondary}
            onClick={beginManualLabEntry}
          >
            {fa ? "ثبت دستی آزمایش" : "Manual entry"}
          </button>
          <input ref={cameraRef} className={styles.hidden} type="file" accept="image/*" capture="environment" onChange={(event) => void processFile(event.target.files?.[0])} />
          <input ref={fileRef} className={styles.hidden} type="file" accept="application/pdf,image/*" onChange={(event) => void processFile(event.target.files?.[0])} />
        </div>
        {ocrProgress && <div className={styles.progress}><div style={{ width: `${progressPercent}%` }} /><span>{progressPercent}% · {ocrProgress.message}</span></div>}
        <p className={styles.privacy}>{fa ? "در حالت OCR مرورگری، تصویر برای سرویس OCR خارجی آپلود نمی‌شود؛ مدل‌های زبان فارسی/انگلیسی در اولین استفاده ممکن است دانلود شوند." : "Browser OCR does not upload the image to a third-party OCR service; Persian/English language models may download on first use."}</p>

        {patientFieldSuggestions.length > 0 && (
          <div className={styles.patientOcrReview}>
            <div className={styles.patientOcrReviewHeader}>
              <div>
                <strong>
                  {fa
                    ? "اطلاعات بیمار استخراج‌شده از برگه"
                    : "Patient details detected on the document"}
                </strong>
                <small>
                  {fa
                    ? "این موارد پیشنهاد OCR هستند و هیچ فیلد موجودی را خودکار جایگزین نمی‌کنند. هر مورد را پس از تطبیق با برگه اعمال کنید."
                    : "These are OCR suggestions. Existing fields are never overwritten automatically; apply each item only after checking the document."}
                </small>
              </div>
            </div>
            <div className={styles.patientOcrSuggestionGrid}>
              {patientFieldSuggestions.map((suggestion, index) => {
                const applied = isPatientSuggestionApplied(suggestion);

                return (
                  <div
                    className={
                      applied
                        ? `${styles.patientOcrSuggestion} ${styles.patientOcrSuggestionApplied}`
                        : styles.patientOcrSuggestion
                    }
                    key={`${suggestion.field}:${String(suggestion.value)}:${suggestion.sourceDocumentName}:${index}`}
                  >
                    <div>
                      <span>{patientSuggestionLabel(suggestion)}</span>
                      <strong>
                        {patientSuggestionValue(suggestion)}
                        {suggestion.field === "reported_age_years"
                          ? (fa ? " سال" : " years")
                          : suggestion.field === "weight_kg"
                            ? " kg"
                            : suggestion.field === "height_cm"
                              ? " cm"
                              : ""}
                      </strong>
                      <small>
                        {fa ? "صفحه" : "page"} {suggestion.sourcePage ?? 1}
                        {" · "}
                        {fa ? "اطمینان parser" : "parser confidence"}{" "}
                        {Math.round(suggestion.parserConfidence * 100)}%
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={busy || applied}
                      onClick={() => applyPatientFieldSuggestion(suggestion)}
                    >
                      {applied
                        ? (fa ? "اعمال شد ✓" : "Applied ✓")
                        : (fa ? "اعمال پس از بررسی" : "Apply after review")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <datalist id="glymize-lab-catalog">
  {LAB_DATALIST_OPTIONS.map((option) => (
    <option
      key={option.key}
      value={option.value}
      label={option.label}
    />
  ))}
</datalist>
        {labs.length > 0 && <div className={styles.labResultsBlock}>
          <div className={styles.labTableToolbar}>
            <div>
              <strong>{fa ? "نتایج آزمایش" : "Lab results"}</strong>
              <small>{fa ? "برای آزمایش دوم و بعدی، ردیف جدید اضافه کنید." : "Add another row for each additional observation."}</small>
            </div>
            <button
              type="button"
              className={styles.addLabRow}
              onClick={addManualLab}
              disabled={busy}
            >
              + {fa ? "افزودن ردیف" : "Add row"}
            </button>
          </div>
          <div className={styles.labTable}>
          <div className={styles.labHeader}>
            <span>{fa ? "\u0622\u0632\u0645\u0627\u06cc\u0634" : "Test"}</span>
            <span>{fa ? "\u0645\u0642\u062f\u0627\u0631" : "Value"}</span>
            <span>{fa ? "\u0648\u0627\u062d\u062f" : "Unit"}</span>
            <span>{fa ? "\u0645\u062d\u062f\u0648\u062f\u0647 \u0645\u0631\u062c\u0639" : "Reference"}</span>
            <span>{fa ? "\u062a\u0627\u0631\u06cc\u062e" : "Date"}</span>
            <span>{fa ? "\u067e\u0631\u0686\u0645 H/L" : "H/L flag"}</span>
            <span>{fa ? "\u0648\u0636\u0639\u06cc\u062a" : "State"}</span>
          </div>
          {labs.map((lab) => <div
            className={
              labNeedsReviewAttention(lab)
                ? `${styles.labRow} ${styles.labRowAttention}`
                : styles.labRow
            }
            key={lab.id}
          >
            <input
              list="glymize-lab-catalog"
              value={lab.rawName}
              placeholder={fa ? "\u0646\u0627\u0645 \u0622\u0632\u0645\u0627\u06cc\u0634 \u0631\u0627 \u062c\u0633\u062a\u200c\u0648\u062c\u0648 \u06a9\u0646\u06cc\u062f" : "Search lab test"}
              onChange={(event) => updateLabName(
                lab.id,
                event.target.value,
              )}
            />
            <input
              className={
                labNeedsReviewAttention(lab)
                  ? styles.labValueAttention
                  : undefined
              }
              value={labValueInput(lab)}
              placeholder={fa ? "\u0645\u0642\u062f\u0627\u0631" : "Value"}
              onChange={(event) => updateLabValue(
                lab.id,
                event.target.value,
              )}
            />
            <input
              value={lab.unit ?? ""}
              placeholder={fa ? "\u0648\u0627\u062d\u062f" : "Unit"}
              onChange={(event) => updateLab(
                lab.id,
                { unit: event.target.value },
              )}
            />
            <input
              value={lab.referenceRange ?? ""}
              placeholder={fa ? "\u0645\u062b\u0644\u0627\u064b 70-100" : "e.g. 70-100"}
              onChange={(event) => updateLab(
                lab.id,
                { referenceRange: event.target.value },
              )}
            />
            <input
              type={
                isPersianCalendarDate(lab.observedAt)
                  ? "text"
                  : "date"
              }
              value={labDateInputValue(lab.observedAt)}
              placeholder={
                fa
                  ? "مثلاً 1405/05/10"
                  : "YYYY-MM-DD"
              }
              title={
                isPersianCalendarDate(lab.observedAt)
                  ? (fa
                    ? "تاریخ شمسی همان‌طور که روی برگه گزارش شده"
                    : "Persian-calendar date as reported on the document")
                  : undefined
              }
              onChange={(event) => updateLab(
                lab.id,
                {
                  observedAt:
                    event.target.value || undefined,
                },
              )}
            />
            <select
              className={styles.labFlag}
              data-interpretation={lab.interpretation ?? ""}
              value={lab.interpretation ?? ""}
              onChange={(event) => updateLab(
                lab.id,
                {
                  interpretation:
                    (event.target.value || undefined) as PatientHandoffLab["interpretation"],
                  interpretationSource:
                    event.target.value ? "manual" : undefined,
                },
              )}
            >
              <option value="">
                {fa ? "\u0628\u062f\u0648\u0646 \u067e\u0631\u0686\u0645" : "No flag"}
              </option>
              <option value="N">N - {fa ? "\u0646\u0631\u0645\u0627\u0644" : "Normal"}</option>
              <option value="L">L - {fa ? "\u067e\u0627\u06cc\u06cc\u0646" : "Low"}</option>
              <option value="H">H - {fa ? "\u0628\u0627\u0644\u0627" : "High"}</option>
              <option value="LL">LL - {fa ? "\u067e\u0627\u06cc\u06cc\u0646 \u0628\u062d\u0631\u0627\u0646\u06cc" : "Critical low"}</option>
              <option value="HH">HH - {fa ? "\u0628\u0627\u0644\u0627\u06cc \u0628\u062d\u0631\u0627\u0646\u06cc" : "Critical high"}</option>
              <option value="A">A - {fa ? "\u063a\u06cc\u0631\u0637\u0628\u06cc\u0639\u06cc" : "Abnormal"}</option>
            </select>
            <div className={styles.verifyActions}>
              <button
                type="button"
                title={fa ? "\u062a\u0627\u06cc\u06cc\u062f" : "Confirm"}
                className={lab.verification === "confirmed" ? styles.confirmed : styles.smallButton}
                onClick={() => updateLab(
                  lab.id,
                  { verification: "confirmed" },
                )}
              >
                {"\u2713"}
              </button>
              <button
                type="button"
                title={fa ? "\u0631\u062f" : "Reject"}
                className={lab.verification === "rejected" ? styles.rejected : styles.smallButton}
                onClick={() => updateLab(
                  lab.id,
                  { verification: "rejected" },
                )}
              >
                {"\u00d7"}
              </button>
              <button
                type="button"
                title={fa ? "\u062d\u0630\u0641 \u0631\u062f\u06cc\u0641" : "Remove row"}
                className={styles.removeLab}
                onClick={() => removeLab(lab.id)}
              >
                {"\u2212"}
              </button>
              <small>
                {labNeedsReviewAttention(lab)
                  ? (fa ? "⚠ تطبیق عدد" : "⚠ check value")
                  : lab.verification === "confirmed"
                    ? (fa ? "\u062a\u0627\u06cc\u06cc\u062f" : "confirmed")
                    : lab.verification === "rejected"
                      ? (fa ? "\u0631\u062f" : "rejected")
                      : (fa ? "\u0628\u0627\u0632\u0628\u06cc\u0646\u06cc" : "review")}
              </small>
            </div>
          </div>)}
        </div></div>}
        {ocrText && <details className={styles.ocrRaw}><summary>{fa ? "متن خام OCR" : "Raw OCR text"}</summary><textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} rows={10} /></details>}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionTitle}><b>3</b><div><h2>{fa ? "اطلاعات بالینی پایه" : "Basic clinical data"}</h2><p>{fa ? "این داده‌ها پس از اعمال توسط پزشک، فرم Type 2 را prefill می‌کنند." : "After physician review/apply, these values prefill the Type 2 form."}</p></div></div>
        <div className={styles.gridClinical}>
          <label>
            <span>{fa ? "سن گزارش‌شده (سال)" : "Reported age (years)"}</span>
            <input
              inputMode="numeric"
              value={reportedAgeYears}
              onChange={(event) => {
                setReportedAgeYears(event.target.value);
                clearPatientFieldProvenance("reportedAgeYears");
              }}
            />
          </label>
          <label>
            <span>{fa ? "جنس گزارش‌شده" : "Reported sex"}</span>
            <select
              value={reportedSex}
              onChange={(event) => {
                setReportedSex(
                  event.target.value as PatientReportedSex | "",
                );
                clearPatientFieldProvenance("reportedSex");
              }}
            >
              <option value="">
                {fa ? "نامشخص / ثبت نشده" : "Unknown / not recorded"}
              </option>
              <option value="male">{fa ? "مرد" : "Male"}</option>
              <option value="female">{fa ? "زن" : "Female"}</option>
            </select>
          </label>
          <label><span>{fa ? "وزن kg" : "Weight kg"}</span><input inputMode="decimal" value={vitals.weightKg} onChange={(e) => updateVital("weightKg", e.target.value)} /></label>
          <label><span>{fa ? "قد cm" : "Height cm"}</span><input inputMode="decimal" value={vitals.heightCm} onChange={(e) => updateVital("heightCm", e.target.value)} /></label>
          <label><span>{fa ? "فشار سیستول" : "Systolic BP"}</span><input inputMode="numeric" value={vitals.systolicBp} onChange={(e) => updateVital("systolicBp", e.target.value)} /></label>
          <label><span>{fa ? "فشار دیاستول" : "Diastolic BP"}</span><input inputMode="numeric" value={vitals.diastolicBp} onChange={(e) => updateVital("diastolicBp", e.target.value)} /></label>
          <label><span>{fa ? "نبض" : "Pulse"}</span><input inputMode="numeric" value={vitals.pulseBpm} onChange={(e) => updateVital("pulseBpm", e.target.value)} /></label>
        </div>
        <div className={styles.flagGrid}>
          {([
            ["ascvd", fa ? "ASCVD" : "ASCVD"], ["heartFailure", fa ? "نارسایی قلبی" : "Heart failure"], ["ckd", fa ? "CKD" : "CKD"],
            ["dialysis", fa ? "دیالیز" : "Dialysis"], ["diabeticFoot", fa ? "زخم پای دیابتی" : "Diabetic foot"], ["masldMash", "MASLD / MASH"], ["hypoglycemiaRisk", fa ? "ریسک هیپوگلیسمی" : "Hypoglycemia risk"],
          ] as Array<[keyof PatientHandoffClinicalFlags, string]>).map(([key, label]) => <label className={flags[key] ? styles.flagSelected : styles.flag} key={key}><input type="checkbox" checked={Boolean(flags[key])} onChange={() => toggleFlag(key)} /><span>{label}</span></label>)}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionTitle}><b>4</b><div><h2>{fa ? "داروهای فعلی" : "Current medications"}</h2><p>{fa ? "هر دارو ابتدا در وضعیت بازبینی است؛ فقط ردیفی که پرستار با ✓ تأیید کند برای پزشک قابل Apply خواهد بود." : "Each medication starts in review state; only rows explicitly confirmed with ✓ can be applied by the physician."}</p></div></div>
        <div className={styles.medList}>
          {medications.map((item) => <div className={styles.medRow} key={item.id}>
            <input placeholder={fa ? "نام ژنریک" : "Generic name"} value={item.genericName} onChange={(e) => updateMedication(item.id, { genericName: e.target.value })} />
            <input inputMode="decimal" placeholder={fa ? "دوز" : "Dose"} value={item.doseAmount} onChange={(e) => updateMedication(item.id, { doseAmount: e.target.value })} />
            <select value={item.doseUnit} onChange={(e) => updateMedication(item.id, { doseUnit: e.target.value })}><option>mg</option><option>unit</option><option>mcg</option></select>
            <div className={styles.frequencyField}><input inputMode="text" placeholder={fa ? "BID یا 2" : "BID or 2"} value={item.frequencyPerDay} onChange={(e) => updateMedication(item.id, { frequencyPerDay: e.target.value })} />{item.frequencyPerDay.trim() && (() => { const parsed = parseMedicationFrequency(item.frequencyPerDay); return <small className={parsed.valid ? styles.frequencyOk : styles.frequencyWarning}>{parsed.valid && parsed.timesPerDay !== undefined ? `${parsed.code} = ${parsed.timesPerDay} ${fa ? "بار/روز" : "times/day"}` : (fa ? "فرکانس شناخته نشد؛ OD/BID/TID/QID یا عدد وارد کنید." : "Unrecognized frequency; enter OD/BID/TID/QID or a number.")}</small>; })()}</div>
            <div className={styles.verifyActions}>
              <button type="button" title={fa ? "تأیید دارو" : "Confirm medication"} className={item.verification === "confirmed" ? styles.confirmed : styles.smallButton} onClick={() => updateMedication(item.id, { verification: "confirmed" })}>✓</button>
              <button type="button" title={fa ? "رد / عدم انتقال" : "Reject / exclude"} className={item.verification === "rejected" ? styles.rejected : styles.smallButton} onClick={() => updateMedication(item.id, { verification: "rejected" })}>×</button>
              <small>{item.verification === "confirmed" ? (fa ? "تأیید" : "confirmed") : item.verification === "rejected" ? (fa ? "رد" : "rejected") : (fa ? "بازبینی" : "review")}</small>
            </div>
            <button type="button" className={styles.remove} onClick={() => setMedications((current) => current.filter((med) => med.id !== item.id))}>×</button>
          </div>)}
          <button type="button" className={styles.add} onClick={() => setMedications((current) => [...current, newMedication()])}>+ {fa ? "افزودن دارو" : "Add medication"}</button>
        </div>
        <label className={styles.notes}><span>{fa ? "یادداشت دستیار/پرستار" : "Assistant / nurse notes"}</span><textarea rows={4} value={nurseNotes} onChange={(e) => setNurseNotes(e.target.value)} /></label>
      </section>

      <section className={styles.handoffBar}>
        <div><strong>{fa ? "آماده‌سازی برای پزشک" : "Prepare physician handoff"}</strong><p>{fa ? "فقط آزمایش‌هایی که با ✓ تأیید شده‌اند هنگام Apply به Type 2 منتقل می‌شوند." : "Only labs confirmed with ✓ are transferred when the physician applies this handoff to Type 2."}</p></div>
        <div className={styles.handoffActions}>
          <button type="button" disabled={busy} onClick={() => void save()}>{busy ? (fa ? "در حال پردازش…" : "Working…") : (fa ? "ذخیره و آماده‌سازی" : "Save handoff")}</button>
          <button
            type="button"
            disabled={busy}
            className={styles.newRecordButton}
            onClick={requestNewRecord}
          >
            + {fa ? "ایجاد پرونده جدید" : "New patient handoff"}
          </button>
        </div>
      </section>
      {status && <div className={styles.status} role="status">{status}</div>}

{patientCodeCollision && (
  <div className={styles.dialogBackdrop}>
    <section
      className={styles.duplicateCodeDialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-code-dialog-title"
    >
      <span className={styles.dialogEyebrow}>
        {fa ? "تداخل شماره پرونده" : "PATIENT CODE COLLISION"}
      </span>
      <h2 id="duplicate-code-dialog-title">
        {fa
          ? "این کد قبلاً برای یک پرونده ثبت شده است"
          : "This code is already assigned to a patient record"}
      </h2>
      <p>
        {fa
          ? "برای جلوگیری از ثبت اطلاعات یک بیمار روی پرونده بیمار دیگر، ذخیره متوقف شده است."
          : "Save was stopped to prevent one patient's data from being written over another patient's record."}
      </p>

      {patientCodeCollision.existing && (
        <div className={styles.duplicatePatientSummary}>
          <strong>
            {[
              patientCodeCollision.existing.firstName,
              patientCodeCollision.existing.lastName,
            ].filter(Boolean).join(" ") ||
              (fa ? "نام ثبت نشده" : "Name not recorded")}
          </strong>
          <span>
            {fa ? "سن" : "Age"}:{" "}
            {patientCodeCollision.existing.demographics
              ?.reportedAgeYears ?? (fa ? "ثبت نشده" : "not recorded")}
          </span>
          <span>
            {fa ? "جنس" : "Sex"}:{" "}
            {patientCodeCollision.existing.demographics
              ?.reportedSex === "male"
              ? (fa ? "مرد" : "Male")
              : patientCodeCollision.existing.demographics
                  ?.reportedSex === "female"
                ? (fa ? "زن" : "Female")
                : (fa ? "ثبت نشده" : "not recorded")}
          </span>
          <span>
            {fa ? "نسخه پرونده" : "Record revision"}:{" "}
            {patientCodeCollision.existing.revision}
          </span>
        </div>
      )}

      {patientCodeCollision.suggestion && (
        <div className={styles.codeSuggestionCard}>
          <span>
            {fa
              ? "آخرین شماره اشغال‌شده در دنباله بررسی‌شده"
              : "Last occupied code in the checked sequence"}
          </span>
          <strong>{patientCodeCollision.suggestion.lastOccupiedCode}</strong>
          <span>
            {fa ? "اولین شماره آزاد بعدی" : "First free next file number"}
          </span>
          <strong>{patientCodeCollision.suggestion.suggestedCode}</strong>
          <small>
            {fa
              ? "این شماره در زمان بررسی آزاد بوده و هنگام ذخیره دوباره توسط سرور کنترل می‌شود."
              : "This number was free at check time and will be checked again atomically on save."}
          </small>
        </div>
      )}

      <div className={styles.dialogActions}>
        {patientCodeCollision.suggestion && (
          <button
            type="button"
            className={styles.dialogPrimary}
            onClick={useSuggestedPatientCode}
          >
            {fa
              ? `استفاده از ${patientCodeCollision.suggestion.suggestedCode}`
              : `Use ${patientCodeCollision.suggestion.suggestedCode}`}
          </button>
        )}
        <button
          type="button"
          className={styles.dialogCancel}
          onClick={() => {
            setPatientCodeCollision(null);
            queueMicrotask(() => patientCodeInputRef.current?.focus());
          }}
        >
          {fa ? "کد دیگری وارد می‌کنم" : "Enter another code"}
        </button>
        <button
          type="button"
          className={styles.dialogDiscard}
          onClick={openExistingFromCollision}
        >
          {fa
            ? "باز کردن پرونده موجود و کنار گذاشتن ورودی فعلی"
            : "Open existing record and discard current entry"}
        </button>
      </div>
    </section>
  </div>
)}

      {fullNameReviewSuggestion && (
        <div className={styles.dialogBackdrop}>
          <section
            className={styles.fullNameReviewDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="full-name-review-title"
          >
            <span className={styles.dialogEyebrow}>
              {fa ? "بازبینی نام OCR" : "OCR NAME REVIEW"}
            </span>
            <h2 id="full-name-review-title">
              {fa ? "نام کامل را به نام و نام خانوادگی تبدیل کنید" : "Split the reviewed full name"}
            </h2>
            <p className={styles.fullNameSource}><strong>{String(fullNameReviewSuggestion.value)}</strong></p>
            <p>
              {fa
                ? "برای نام‌های چندبخشی GLYMIZE حدس نمی‌زند. پس از تطبیق با برگه، دو فیلد زیر را تکمیل کنید."
                : "GLYMIZE does not guess multipart name boundaries. Review the document and complete the two fields below."}
            </p>
            <div className={styles.fullNameReviewGrid}>
              <label>
                <span>{fa ? "نام" : "First name"}</span>
                <input value={fullNameReviewFirstName} onChange={(event) => setFullNameReviewFirstName(event.target.value)} autoFocus />
              </label>
              <label>
                <span>{fa ? "نام خانوادگی" : "Last name"}</span>
                <input value={fullNameReviewLastName} onChange={(event) => setFullNameReviewLastName(event.target.value)} />
              </label>
            </div>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.dialogPrimary} onClick={confirmFullNameReview}>
                {fa ? "ثبت پس از بازبینی" : "Apply reviewed name"}
              </button>
              <button
                type="button"
                className={styles.dialogCancel}
                onClick={() => {
                  setFullNameReviewSuggestion(null);
                  setFullNameReviewFirstName("");
                  setFullNameReviewLastName("");
                }}
              >
                {fa ? "انصراف" : "Cancel"}
              </button>
            </div>
          </section>
        </div>
      )}

      {newRecordPromptOpen && (
        <div className={styles.dialogBackdrop}>
          <section
            className={styles.newRecordDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-record-dialog-title"
          >
            <span className={styles.dialogEyebrow}>
              {fa ? "تغییرات ذخیره‌نشده" : "UNSAVED CHANGES"}
            </span>
            <h2 id="new-record-dialog-title">
              {fa ? "قبل از ایجاد پرونده جدید چه کار کنم؟" : "What should happen before starting a new patient?"}
            </h2>
            <p>
              {fa
                ? "اطلاعات پرونده فعلی هنوز از آخرین ذخیره تغییر کرده است. می‌توانید ابتدا آن را ذخیره کنید، بدون ذخیره کنار بگذارید، یا به فرم برگردید."
                : "The current handoff has changed since its last save. Save it first, discard the unsaved changes, or return to the form."}
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.dialogPrimary} onClick={() => void saveAndStartNew()}>
                {fa ? "ذخیره و ایجاد پرونده جدید" : "Save & start new"}
              </button>
              <button type="button" className={styles.dialogDiscard} onClick={discardAndStartNew}>
                {fa ? "بدون ذخیره، پرونده جدید" : "Discard & start new"}
              </button>
              <button type="button" className={styles.dialogCancel} onClick={() => setNewRecordPromptOpen(false)}>
                {fa ? "انصراف" : "Cancel"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
