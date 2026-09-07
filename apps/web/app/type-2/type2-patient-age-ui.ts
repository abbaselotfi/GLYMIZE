import type { PatientHandoffRecord, PatientLongitudinalSummary } from "@glymize/contracts";

export interface Type2PatientAgeDraft {
  /** Canonical longitudinal DOB when known. This always has precedence. */
  dateOfBirth: string;
  /** Encounter/source-reported age used only when its field provenance is confirmed. */
  confirmedReportedAgeYears: number | undefined;
}

export const emptyType2PatientAgeDraft: Type2PatientAgeDraft = {
  dateOfBirth: "",
  confirmedReportedAgeYears: undefined,
};

export type Type2PatientAgeResolution =
  | { ageYears: number; source: "date_of_birth" }
  | { ageYears: number; source: "confirmed_reported_age" }
  | { ageYears: undefined; source: "unknown" };

type CalendarDate = { year: number; month: number; day: number };

function canonicalCalendarDate(value: string): CalendarDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return undefined;
  return { year, month, day };
}

function localCalendarDate(date: Date): CalendarDate {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function ageOnDate(dateOfBirth: CalendarDate, asOf: CalendarDate) {
  if (
    dateOfBirth.year > asOf.year ||
    (dateOfBirth.year === asOf.year && dateOfBirth.month > asOf.month) ||
    (dateOfBirth.year === asOf.year && dateOfBirth.month === asOf.month && dateOfBirth.day > asOf.day)
  ) return undefined;

  let age = asOf.year - dateOfBirth.year;
  if (
    asOf.month < dateOfBirth.month ||
    (asOf.month === dateOfBirth.month && asOf.day < dateOfBirth.day)
  ) age -= 1;
  return age >= 0 ? age : undefined;
}

export function type2AgeYearsFromDateOfBirth(
  dateOfBirth: string,
  asOf: Date = new Date(),
): number | undefined {
  const birth = canonicalCalendarDate(dateOfBirth);
  if (!birth || Number.isNaN(asOf.getTime())) return undefined;
  return ageOnDate(birth, localCalendarDate(asOf));
}

function confirmedReportedAge(record: PatientHandoffRecord | undefined) {
  const age = record?.demographics?.reportedAgeYears;
  const provenance = record?.patientFieldProvenance?.reportedAgeYears;
  if (
    provenance?.verification !== "confirmed" ||
    typeof age !== "number" ||
    !Number.isFinite(age) ||
    age < 0
  ) return undefined;
  return age;
}

export function type2PatientAgeDraftFromPatientData(
  record: PatientHandoffRecord,
  patient?: PatientLongitudinalSummary,
): Type2PatientAgeDraft {
  return {
    dateOfBirth: patient?.demographics?.dateOfBirth?.trim() ?? "",
    confirmedReportedAgeYears: confirmedReportedAge(record),
  };
}

/**
 * Resolves age for the Type 2 request without fabricating demographic authority.
 * A longitudinal DOB wins over encounter-reported age. Reported age is accepted
 * only when the handoff field provenance is explicitly confirmed. Reported age
 * is never reverse-converted into a DOB.
 */
export function type2PatientAgeFromDraft(
  draft: Type2PatientAgeDraft,
  asOf: Date = new Date(),
): Type2PatientAgeResolution {
  const fromDob = type2AgeYearsFromDateOfBirth(draft.dateOfBirth, asOf);
  if (fromDob !== undefined) return { ageYears: fromDob, source: "date_of_birth" };

  const reported = draft.confirmedReportedAgeYears;
  if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) {
    return { ageYears: reported, source: "confirmed_reported_age" };
  }

  return { ageYears: undefined, source: "unknown" };
}
