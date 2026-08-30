"use client";

import { useState } from "react";
import type { PatientHandoffRecord } from "@glymize/contracts";
import {
  lookupPatientHandoff as lookupLegacyPatientHandoff,
} from "../../lib/patient-handoff-client";
import {
  lookupPatientHandoffForReview,
} from "../../lib/care-team-record-client";
import { useGlymizeLocale } from "./use-glymize-locale";
import styles from "./patient-handoff-lookup.module.css";

export default function PatientHandoffLookup({ onApply }: { onApply: (record: PatientHandoffRecord) => void }) {
  const { locale } = useGlymizeLocale();
  const fa = locale === "fa";
  const [code, setCode] = useState("");
  const [record, setRecord] = useState<PatientHandoffRecord | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookup() {
    if (!code.trim()) {
      setStatus(fa ? "کد بیمار را وارد کنید." : "Enter the patient code.");
      return;
    }
    setBusy(true);
    setRecord(null);
    try {
      const v2Result =
        await lookupPatientHandoffForReview(code);
      const result =
        v2Result.resolution === "legacy"
          ? await lookupLegacyPatientHandoff(
              code,
              v2Result.patientCodeKind,
            )
          : v2Result;
      if (!result.found || !result.record) {
        setStatus(fa ? "پرونده آماده‌ای با این کد پیدا نشد." : "No prepared handoff was found for this code.");
        return;
      }
      setRecord(result.record);
      setStatus("");
    } catch (error) {
      const codeValue = error instanceof Error ? error.message : "LOOKUP_FAILED";
      setStatus(codeValue === "HANDOFF_UNAUTHORIZED"
        ? (fa ? "توکن ارتباط پزشک/پرستار با API هماهنگ نیست." : "Physician/nurse handoff token does not match the API.")
        : codeValue === "AMBIGUOUS_PATIENT_CODE"
          ? (fa ? "این کد در بیش از یک نوع شناسه تکرار شده است؛ ابتدا نوع کدها را در پنل پرستار اصلاح کنید." : "This code is duplicated across identifier types; resolve it in the nurse panel first.")
          : codeValue === "HANDOFF_API_NOT_CONFIGURED"
            ? (fa ? "API محلی handoff اجرا نشده است. GLYMIZE را با start-local.ps1 اجرا کنید." : "The local handoff API is not running. Start GLYMIZE with start-local.ps1.")
            : (fa ? "دریافت پرونده انجام نشد." : "Could not retrieve the handoff."));
    } finally {
      setBusy(false);
    }
  }

  const confirmedLabs = record?.labs.filter((item) => item.verification === "confirmed") ?? [];
  const flaggedLabs = confirmedLabs.filter((item) => item.interpretation && item.interpretation !== "N");
  const rejectedOrPending = record?.labs.filter((item) => item.verification !== "confirmed") ?? [];
  const confirmedMeds = record?.medications.filter((item) => item.verification === "confirmed") ?? [];
  const fullName = [record?.firstName, record?.lastName].filter(Boolean).join(" ");


  function openForEdit() {
    if (!code.trim()) return;
    window.sessionStorage.setItem("glymize:care-team-edit-code", code.trim());
    window.location.assign("/care-team");
  }


  return (
    <section className={styles.panel} aria-label={fa ? "دریافت اطلاعات بیمار" : "Patient handoff lookup"}>
      <div className={styles.copy}>
        <span>PRE-VISIT HANDOFF</span>
        <h2>{fa ? "دریافت اطلاعات بیمار" : "Load prepared patient data"}</h2>
        <p>{fa ? "کد پرونده/کد ملی ثبت‌شده توسط دستیار را وارد کنید. ابتدا پیش‌نمایش می‌بینید و فقط با «اعمال داده» مقادیر تأییدشده وارد فرم Type 2 می‌شوند." : "Enter the code prepared by the assistant. You will see a preview first; only confirmed values enter Type 2 after Apply data."}</p>
      </div>
      <div className={styles.action}>
        <input value={code} onChange={(event) => { setCode(event.target.value); setRecord(null); setStatus(""); }} placeholder={fa ? "کد بیمار" : "Patient code"} autoComplete="off" />
        <button type="button" disabled={busy} onClick={() => void lookup()}>{busy ? "…" : (fa ? "دریافت" : "Load")}</button>
      </div>
      {record && <div className={styles.preview}>
        <div><strong>{fullName || (fa ? "بیمار بدون نام ثبت‌شده" : "Patient name not recorded")}</strong><small>{record.patientCodeDisplay} · rev {record.revision} · {new Date(record.updatedAt).toLocaleString(fa ? "fa-IR" : "en-US")}</small></div>
        <div className={styles.metrics}><span><b>{confirmedLabs.length}</b>{fa ? " آزمایش تأییدشده" : " confirmed labs"}</span><span><b>{confirmedMeds.length}</b>{fa ? " داروی تأییدشده" : " confirmed meds"}</span>{rejectedOrPending.length > 0 && <span className={styles.pending}><b>{rejectedOrPending.length}</b>{fa ? " مورد OCR منتقل نمی‌شود" : " OCR items excluded"}</span>}</div>
        {flaggedLabs.length > 0 && <div className={styles.status} role="status">
          {fa
            ? `\u0647\u0634\u062f\u0627\u0631 \u0628\u0631\u06af\u0647 \u0622\u0632\u0645\u0627\u06cc\u0634: ${flaggedLabs.map((item) => `${item.canonicalName ?? item.rawName} ${item.interpretation}`).join(" \u00b7 ")}`
            : `Reported lab flags: ${flaggedLabs.map((item) => `${item.canonicalName ?? item.rawName} ${item.interpretation}`).join(" \u00b7 ")}`}
        </div>}
        <div className={styles.previewActions}><button className={styles.edit} type="button" onClick={openForEdit}>{fa ? "باز کردن / ویرایش پرونده" : "Open / edit handoff"}</button><button className={styles.apply} type="button" onClick={() => { onApply(record); setStatus(fa ? "داده‌های تأییدشده روی فرم اعمال شد؛ قبل از محاسبه مرور کنید." : "Confirmed data was applied; review the form before calculation."); }}>{fa ? "اعمال داده" : "Apply data"}</button></div>
      </div>}
      {status && <div className={styles.status} role="status">{status}</div>}
    </section>
  );
}
