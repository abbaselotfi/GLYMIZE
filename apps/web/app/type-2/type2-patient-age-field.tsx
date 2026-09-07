"use client";

import {
  type2PatientAgeFromDraft,
  type Type2PatientAgeDraft,
} from "./type2-patient-age-ui";

interface Type2PatientAgeFieldProps {
  className?: string;
  draft: Type2PatientAgeDraft;
  fa: boolean;
  onDateOfBirthChange: (value: string) => void;
}

export default function Type2PatientAgeField({
  className,
  draft,
  fa,
  onDateOfBirthChange,
}: Type2PatientAgeFieldProps) {
  const resolution = type2PatientAgeFromDraft(draft);
  const source = resolution.source === "date_of_birth"
    ? (fa ? "محاسبه‌شده از تاریخ تولد" : "derived from date of birth")
    : resolution.source === "confirmed_reported_age"
      ? (fa ? "سن گزارش‌شده تأییدشده" : "confirmed reported age")
      : (fa ? "سن نامشخص؛ محدودیت‌های سنی fail-closed می‌مانند" : "age unknown; age gates remain fail-closed");

  return (
    <label className={className}>
      <span>{fa ? "تاریخ تولد" : "Date of birth"}</span>
      <div>
        <input
          aria-label={fa ? "تاریخ تولد بیمار" : "Patient date of birth"}
          type="date"
          value={draft.dateOfBirth}
          onChange={(event) => onDateOfBirthChange(event.target.value)}
        />
        <small>
          {resolution.ageYears === undefined
            ? source
            : `${resolution.ageYears} ${fa ? "سال" : "years"} · ${source}`}
        </small>
      </div>
    </label>
  );
}
