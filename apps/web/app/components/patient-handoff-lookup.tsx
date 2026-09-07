"use client";

import { useState } from "react";
import type {
  PatientCodeKind,
  PatientHandoffRecord,
  PatientLongitudinalSummary,
  PatientRecordArchiveItem,
} from "@glymize/contracts";
import { normalizePatientCode } from "@glymize/contracts";
import {
  lookupPatientHandoff as lookupLegacyPatientHandoff,
} from "../../lib/patient-handoff-client";
import {
  lookupPatientHandoffForReview,
} from "../../lib/care-team-record-client";
import {
  openPatientRecordArchiveItem,
} from "../../lib/patient-record-archive-client";
import {
  getPatientWorkspace,
  resolvePatient,
} from "../../lib/patient-record-v2-client";
import { useGlymizeLocale } from "./use-glymize-locale";
import styles from "./patient-handoff-lookup.module.css";

type LookupMode = "auto" | PatientCodeKind;

type PatientStepSelection = {
  resolution: "patient_record_v2" | "legacy_handoff";
  patient?: PatientLongitudinalSummary;
  record?: PatientHandoffRecord;
  identifierDisplay: string;
};

function patientIdentifierDisplay(
  patient: PatientLongitudinalSummary,
  kind: PatientCodeKind,
) {
  return patient.identifiers.find((item) => item.kind === kind)?.displayMask ??
    patient.identifiers.find((item) => item.isPrimary)?.displayMask ??
    patient.identifiers[0]?.displayMask ??
    "••••";
}

function latestPreparedEncounter(
  encounters: Awaited<ReturnType<typeof getPatientWorkspace>>["encounters"],
) {
  return [...encounters]
    .filter(
      (item) =>
        item.source === "care_team" &&
        item.status === "ready_for_physician",
    )
    .sort((left, right) => right.encounterAt.localeCompare(left.encounterAt))[0];
}

export default function PatientHandoffLookup({ onApply }: { onApply: (record: PatientHandoffRecord, patient: PatientLongitudinalSummary | undefined) => void }) {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [code, setCode] = useState("");
  const [lookupMode, setLookupMode] = useState<LookupMode>("auto");
  const [selection, setSelection] = useState<PatientStepSelection | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState(false);

  async function lookup() {
    const normalized = normalizePatientCode(code);
    if (!normalized) {
      setStatus(fa ? "شناسه بیمار را وارد کنید." : "Enter a patient identifier.");
      return;
    }

    setBusy(true);
    setSelection(null);
    setSkipped(false);

    try {
      if (lookupMode === "auto") {
        // Preserve the established physician review boundary: Patient Record v2
        // is checked first and legacy remains a read-only fallback. This helper
        // performs no implicit legacy promotion or patient/encounter writes.
        const v2Result = await lookupPatientHandoffForReview(normalized);

        if (v2Result.resolution === "legacy") {
          const legacy = await lookupLegacyPatientHandoff(
            normalized,
            v2Result.patientCodeKind,
          );
          if (!legacy.found || !legacy.record) {
            setStatus(fa ? "پرونده آماده‌ای با این شناسه پیدا نشد." : "No prepared record was found for this identifier.");
            return;
          }
          setSelection({
            resolution: "legacy_handoff",
            record: legacy.record,
            identifierDisplay: legacy.record.patientCodeDisplay,
          });
          setStatus(fa
            ? "handoff قدیمی به‌صورت read-only پیدا شد؛ از این مسیر هیچ promotion خودکاری انجام نمی‌شود."
            : "A legacy handoff was found read-only; this workflow never performs automatic promotion.");
          return;
        }

        if (v2Result.resolution === "patient_record_v2") {
          const resolved = await resolvePatient({ identifier: normalized });
          if (!resolved.patient) {
            setStatus(fa ? "پرونده طولی بیمار قابل بازیابی نیست." : "The longitudinal patient record could not be resolved.");
            return;
          }
          const resolvedKind = resolved.resolvedKind as PatientCodeKind;
          const identifierDisplay =
            v2Result.record?.patientCodeDisplay ??
            resolved.matchedIdentifier?.displayMask ??
            patientIdentifierDisplay(resolved.patient, resolvedKind);
          setSelection({
            resolution: "patient_record_v2",
            patient: resolved.patient,
            ...(v2Result.record ? { record: v2Result.record } : {}),
            identifierDisplay,
          });
          setStatus(v2Result.record
            ? ""
            : (fa
                ? "بیمار پیدا شد، اما ویزیت آماده‌شده توسط Care Team وجود ندارد. می‌توانید دستی ادامه دهید یا بیمار را به Care Team هدایت کنید."
                : "Patient found, but there is no Care Team visit ready for physician review. Continue manually or guide the patient to Care Team."));
          return;
        }

        setStatus(fa
          ? "بیماری با این شناسه پیدا نشد. می‌توانید به Care Team هدایت کنید یا بدون پرونده ادامه دهید."
          : "No patient was found. Guide to Care Team or continue without a patient record.");
        return;
      }

      // Explicit identifier override intentionally bypasses automatic kind
      // inference but keeps the same Patient Record v2 read authority.
      const resolved = await resolvePatient({
        identifier: normalized,
        kind: lookupMode,
      });

      if (resolved.patient) {
        const workspace = await getPatientWorkspace(resolved.patient.patientId);
        const encounter = latestPreparedEncounter(workspace.encounters);
        const resolvedKind = resolved.resolvedKind as PatientCodeKind;
        const identifierDisplay =
          resolved.matchedIdentifier?.displayMask ??
          patientIdentifierDisplay(resolved.patient, resolvedKind);

        let record: PatientHandoffRecord | undefined;
        if (encounter) {
          const archiveItem: PatientRecordArchiveItem = {
            id: `focused:${resolved.patient.patientId}:${encounter.encounterId}`,
            source: "patient_record_v2",
            patientId: resolved.patient.patientId,
            encounterId: encounter.encounterId,
            patientCodeKind: resolvedKind,
            patientCodeDisplay: identifierDisplay,
            status: "ready_for_physician",
            revision: encounter.latestSnapshotRevision ?? 0,
            createdAt: encounter.encounterAt,
            updatedAt: encounter.encounterAt,
          };
          record = await openPatientRecordArchiveItem(archiveItem);
        }

        setSelection({
          resolution: "patient_record_v2",
          patient: resolved.patient,
          ...(record ? { record } : {}),
          identifierDisplay,
        });
        setStatus(record
          ? ""
          : (fa
              ? "بیمار پیدا شد، اما ویزیت آماده‌شده توسط Care Team وجود ندارد. می‌توانید دستی ادامه دهید یا بیمار را به Care Team هدایت کنید."
              : "Patient found, but there is no Care Team visit ready for physician review. Continue manually or guide the patient to Care Team."));
        return;
      }

      if (resolved.legacyHandoff) {
        const legacy = await lookupLegacyPatientHandoff(
          normalized,
          resolved.legacyHandoff.kind as PatientCodeKind,
        );
        if (!legacy.found || !legacy.record) {
          setStatus(fa ? "پرونده آماده‌ای با این شناسه پیدا نشد." : "No prepared record was found for this identifier.");
          return;
        }
        setSelection({
          resolution: "legacy_handoff",
          record: legacy.record,
          identifierDisplay: resolved.legacyHandoff.displayMask,
        });
        setStatus(fa
          ? "handoff قدیمی به‌صورت read-only پیدا شد؛ از این مسیر هیچ promotion خودکاری انجام نمی‌شود."
          : "A legacy handoff was found read-only; this workflow never performs automatic promotion.");
        return;
      }

      setStatus(fa
        ? "بیماری با این شناسه پیدا نشد. می‌توانید به Care Team هدایت کنید یا بدون پرونده ادامه دهید."
        : "No patient was found. Guide to Care Team or continue without a patient record.");
    } catch (error) {
      const codeValue = error instanceof Error ? error.message : "LOOKUP_FAILED";
      setStatus(codeValue === "AMBIGUOUS_PATIENT_CODE"
        ? (fa ? "این شناسه مبهم است؛ نوع شناسه را از فهرست انتخاب و دوباره جست‌وجو کنید." : "This identifier is ambiguous. Choose the identifier type and search again.")
        : codeValue === "PATIENT_RECORD_AUTH_REQUIRED" || codeValue === "HANDOFF_UNAUTHORIZED"
          ? (fa ? "برای دریافت پرونده، نشست معتبر پزشک لازم است." : "A valid physician session is required to load this patient.")
          : codeValue === "PATIENT_RECORD_PERMISSION_DENIED"
            ? (fa ? "دسترسی به این بیمار برای نشست فعلی مجاز نیست." : "The current session is not authorized for this patient.")
            : (fa ? "دریافت پرونده انجام نشد." : "Could not load the patient record."));
    } finally {
      setBusy(false);
    }
  }

  const record = selection?.record;
  const confirmedLabs = record?.labs.filter((item) => item.verification === "confirmed") ?? [];
  const flaggedLabs = confirmedLabs.filter((item) => item.interpretation && item.interpretation !== "N");
  const rejectedOrPending = record?.labs.filter((item) => item.verification !== "confirmed") ?? [];
  const confirmedMeds = record?.medications.filter((item) => item.verification === "confirmed") ?? [];
  const fullName = selection?.patient
    ? [selection.patient.demographics?.firstName, selection.patient.demographics?.lastName].filter(Boolean).join(" ")
    : [record?.firstName, record?.lastName].filter(Boolean).join(" ");

  function guideToCareTeam() {
    const normalized = normalizePatientCode(code);
    if (normalized) {
      window.sessionStorage.setItem("glymize:care-team-edit-code", normalized);
    }
    window.location.assign("/care-team");
  }

  function continueWithoutPatient() {
    setSkipped(true);
    setStatus(fa
      ? "ادامه بدون پرونده بیمار انتخاب شد. فرم Type 2 همچنان کاملاً قابل استفاده است."
      : "Continuing without a patient record. The Type 2 workflow remains fully available.");
  }

  return (
    <section
      className={styles.panel}
      aria-label={fa ? "مرحله اختیاری بیمار" : "Optional patient step"}
      data-focused-workflow-patient-step="optional"
    >
      <div className={styles.copy}>
        <span>PATIENT · OPTIONAL FIRST STEP</span>
        <h2>{fa ? "بیمار را بارگذاری کنید — یا بدون پرونده ادامه دهید" : "Load a patient — or continue without a record"}</h2>
        <p>{fa ? "جست‌وجوی هوشمند، کد ملی معتبر را در اولویت می‌گذارد و در غیر این صورت شماره پرونده را بررسی می‌کند. نوع شناسه را نیز می‌توانید صریحاً مشخص کنید. این مرحله هیچ‌وقت مانع ادامه تصمیم‌یار نمی‌شود." : "Smart lookup prioritizes a checksum-valid national ID and otherwise resolves a practice file number. You can also override the identifier type explicitly. This step never blocks the decision-support workflow."}</p>
      </div>

      <div className={styles.action}>
        <select
          aria-label={fa ? "نوع شناسه بیمار" : "Patient identifier type"}
          value={lookupMode}
          onChange={(event) => {
            setLookupMode(event.target.value as LookupMode);
            setSelection(null);
            setStatus("");
            setSkipped(false);
          }}
        >
          <option value="auto">{fa ? "هوشمند (کد ملی / شماره پرونده)" : "Smart (national ID / file number)"}</option>
          <option value="national_id">{fa ? "کد ملی" : "National ID"}</option>
          <option value="file_number">{fa ? "شماره پرونده" : "Practice file number"}</option>
          <option value="other">{fa ? "شناسه پشتیبانی‌شده دیگر" : "Other supported identifier"}</option>
        </select>
        <input
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setSelection(null);
            setStatus("");
            setSkipped(false);
          }}
          placeholder={fa ? "شناسه بیمار" : "Patient identifier"}
          autoComplete="off"
        />
        <button type="button" disabled={busy} onClick={() => void lookup()}>{busy ? "…" : (fa ? "بارگذاری بیمار" : "Load patient")}</button>
      </div>

      {selection && <div className={styles.preview} data-patient-resolution={selection.resolution}>
        <div>
          <strong>{fullName || (fa ? "بیمار بدون نام ثبت‌شده" : "Patient name not recorded")}</strong>
          <small>
            {selection.identifierDisplay}
            {selection.patient?.latestEncounterAt
              ? ` · ${fa ? "آخرین ویزیت" : "latest visit"}: ${new Date(selection.patient.latestEncounterAt).toLocaleDateString(fa ? "fa-IR" : "en-US")}`
              : ""}
          </small>
          <small>{selection.resolution === "patient_record_v2"
            ? (fa ? "Patient Record v2 · هویت طولی پایدار" : "Patient Record v2 · stable longitudinal identity")
            : (fa ? "Legacy handoff · سازگاری فقط‌خواندنی" : "Legacy handoff · read-only compatibility")}</small>
        </div>

        <div className={styles.metrics}>
          {record
            ? <>
                <span><b>{confirmedLabs.length}</b>{fa ? " آزمایش تأییدشده" : " confirmed labs"}</span>
                <span><b>{confirmedMeds.length}</b>{fa ? " داروی تأییدشده" : " confirmed meds"}</span>
                {rejectedOrPending.length > 0 && <span className={styles.pending}><b>{rejectedOrPending.length}</b>{fa ? " مورد تأییدنشده منتقل نمی‌شود" : " unconfirmed items excluded"}</span>}
              </>
            : <span>{fa ? "ویزیت آماده برای پزشک وجود ندارد" : "No visit is ready for physician review"}</span>}
        </div>

        <div className={styles.previewActions}>
          <button className={styles.edit} type="button" onClick={guideToCareTeam}>{fa ? "هدایت به Care Team" : "Guide to Care Team"}</button>
          <button
            className={styles.apply}
            type="button"
            disabled={!record}
            onClick={() => {
              if (!record) return;
              onApply(record, selection.patient);
              setSkipped(false);
              setStatus(fa ? "داده‌های تأییدشده آخرین ویزیت آماده روی فرم اعمال شد؛ قبل از محاسبه مرور کنید." : "Confirmed data from the latest prepared visit was applied; review it before calculation.");
            }}
          >{fa ? "اعمال داده بیمار" : "Apply patient data"}</button>
        </div>

        {flaggedLabs.length > 0 && <div className={styles.status} role="status">
          {fa
            ? `هشدار برگه آزمایش: ${flaggedLabs.map((item) => `${item.canonicalName ?? item.rawName} ${item.interpretation}`).join(" · ")}`
            : `Reported lab flags: ${flaggedLabs.map((item) => `${item.canonicalName ?? item.rawName} ${item.interpretation}`).join(" · ")}`}
        </div>}
      </div>}

      <div className={styles.optionalActions}>
        <button type="button" className={styles.careTeam} onClick={guideToCareTeam}>{fa ? "ارسال / راهنمایی به Care Team" : "Send / guide to Care Team"}</button>
        <button type="button" className={styles.skip} onClick={continueWithoutPatient}>{fa ? "ادامه بدون پرونده بیمار" : "Continue without patient record"}</button>
      </div>

      {skipped && <div className={styles.skipState}>{fa ? "بدون اتصال پرونده · ورود دستی فعال" : "No patient record attached · manual entry active"}</div>}
      {status && <div className={styles.status} role="status">{status}</div>}
    </section>
  );
}
