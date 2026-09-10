"use client";

import Link from "next/link";
import type {
  Type2PatientCoreCandidateField,
  Type2PatientCoreHandoffCandidate,
  Type2RequiredInputIssueReason,
} from "../../lib/type2-patient-core-handoff";
import styles from "./type2-patient-core-handoff-review.module.css";

export type Type2PatientCoreHandoffUiState =
  | "idle"
  | "loading"
  | "ready"
  | "confirmed"
  | "invalid";

function statusLabel(
  field: Type2PatientCoreCandidateField,
  fa: boolean,
) {
  if (field.status === "ready") {
    return fa ? "آماده برای تأیید" : "Ready for confirmation";
  }
  if (field.status === "unverified") {
    return fa ? "تأییدنشده — اعمال نمی‌شود" : "Unverified — not applied";
  }
  if (field.status === "stale") {
    return fa ? "stale — اعمال نمی‌شود" : "Stale — not applied";
  }
  if (field.status === "source_revision_missing") {
    return fa ? "revision نامشخص — اعمال نمی‌شود" : "Missing revision — not applied";
  }
  return fa ? "مقدار نامعتبر — اعمال نمی‌شود" : "Invalid value — not applied";
}

function issueLabel(reason: Type2RequiredInputIssueReason, fa: boolean) {
  if (reason === "missing") {
    return fa ? "HbA1c فعلی در Patient Core موجود نیست." : "Current HbA1c is missing from Patient Core.";
  }
  if (reason === "unverified") {
    return fa ? "جدیدترین HbA1c تأییدنشده است و خودکار اعمال نمی‌شود." : "The newest HbA1c is unverified and will not be applied.";
  }
  if (reason === "stale") {
    return fa ? "HbA1c به‌صورت stale علامت خورده و خودکار اعمال نمی‌شود." : "HbA1c is explicitly marked stale and will not be applied.";
  }
  if (reason === "source_revision_missing") {
    return fa ? "HbA1c revision قابل تطبیق ندارد و خودکار اعمال نمی‌شود." : "HbA1c has no comparable source revision and will not be applied.";
  }
  return fa ? "HbA1c قابل تبدیل به مقدار عددی معتبر نیست." : "HbA1c is not a usable numeric value.";
}

function valueLabel(field: Type2PatientCoreCandidateField, fa: boolean) {
  if (field.value === true) return fa ? "ثبت‌شده: حاضر" : "Recorded: present";
  if (typeof field.value === "number") {
    return `${field.value}${field.unit ? ` ${field.unit}` : ""}`;
  }
  return "—";
}

export default function Type2PatientCoreHandoffReview({
  state,
  candidate,
  errorCode,
  locale,
  onConfirm,
  onDiscard,
}: {
  state: Type2PatientCoreHandoffUiState;
  candidate: Type2PatientCoreHandoffCandidate | null;
  errorCode?: string;
  locale: "fa" | "en";
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  if (state === "idle") return null;
  const fa = locale === "fa";
  const patientHref = candidate
    ? `/patients/${encodeURIComponent(candidate.scope.patientId)}`
    : "/records";

  if (state === "loading") {
    return (
      <section className={styles.panel} data-patient-core-handoff="loading">
        <div className={styles.header}>
          <div>
            <span>PATIENT CORE → TYPE 2</span>
            <h2>{fa ? "در حال بازخوانی context بیمار…" : "Re-reading patient context…"}</h2>
            <p>{fa ? "scope و revision قبل از نمایش هر candidate دوباره بررسی می‌شوند." : "Scope and source revisions are revalidated before any candidate is shown."}</p>
          </div>
          <div className={styles.badge}>{fa ? "بدون Auto-apply" : "No auto-apply"}</div>
        </div>
      </section>
    );
  }

  if (state === "invalid") {
    return (
      <section className={styles.panel} data-patient-core-handoff="invalid">
        <div className={styles.header}>
          <div>
            <span>PATIENT CORE → TYPE 2</span>
            <h2>{fa ? "Handoff قابل اعتماد نیست" : "Handoff could not be trusted"}</h2>
            <p>
              {fa
                ? "patient/practice scope، دسترسی یا source revision با context زمان launch تطبیق ندارد. هیچ مقدار بالینی اعمال نشد."
                : "Patient/practice scope, access, or source revision no longer matches the launch context. No clinical value was applied."}
            </p>
          </div>
          <div className={styles.badge}>FAIL CLOSED</div>
        </div>
        {errorCode && <p className={styles.issue}>{errorCode}</p>}
        <div className={styles.actions}>
          <button className={styles.discard} onClick={onDiscard} type="button">
            {fa ? "ادامه بدون handoff" : "Continue without handoff"}
          </button>
          <Link href={patientHref}>{fa ? "بازگشت به Patient Workspace" : "Back to Patient Workspace"}</Link>
        </div>
      </section>
    );
  }

  if (!candidate) return null;

  if (state === "confirmed") {
    return (
      <section className={styles.panel} data-patient-core-handoff="confirmed">
        <div className={styles.header}>
          <div>
            <span>PATIENT CORE → TYPE 2</span>
            <h2>{fa ? "Context بازبینی‌شده روی فرم اعمال شد" : "Reviewed context applied to the form"}</h2>
            <p>
              {fa
                ? "فقط candidateهای verified و revision-bound اعمال شدند. تغییرات بعدی فرم، ورودی مستقیم پزشک هستند و Decision Graph v2 همچنان مرجع تصمیم Type 2 است."
                : "Only verified, revision-bound candidates were applied. Later form edits are direct clinician input, and Decision Graph v2 remains the Type 2 decision authority."}
            </p>
          </div>
          <div className={styles.badge}>{fa ? "تأیید پزشک" : "Clinician confirmed"}</div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} data-patient-core-handoff="ready">
      <div className={styles.header}>
        <div>
          <span>PATIENT CORE → TYPE 2</span>
          <h2>{fa ? "Context پیشنهادی را قبل از اعمال مرور کنید" : "Review proposed context before applying"}</h2>
          <p>
            {fa
              ? "این مقادیر از Patient Core تازه بازخوانی شده‌اند. freshness ناشناخته به معنی current نیست؛ هیچ candidate قبل از تأیید شما وارد فرم نمی‌شود."
              : "These values were freshly re-read from Patient Core. Unknown freshness does not mean current; no candidate enters the form before your confirmation."}
          </p>
        </div>
        <div className={styles.badge}>{fa ? "Revision تطبیق داده شد" : "Revision matched"}</div>
      </div>

      <div className={styles.grid}>
        {candidate.fields.map((field) => (
          <div className={`${styles.fact} ${styles[field.status] ?? ""}`} key={`${field.key}:${field.source?.factId ?? "missing"}`}>
            <div>
              <strong>{field.label}{field.required ? " *" : ""}</strong>
              <b>{valueLabel(field, fa)}</b>
            </div>
            <small>{statusLabel(field, fa)}</small>
            <small>
              verification: {field.source?.verification ?? "—"} · freshness: {field.freshness} · revision: {field.source?.revision ?? "—"}
            </small>
            {field.observedAt && <small>{fa ? "زمان مشاهده" : "Observed"}: {field.observedAt}</small>}
          </div>
        ))}
      </div>

      {candidate.fields.length === 0 && (
        <p className={styles.issue}>
          {fa ? "هیچ ورودی revision-bound مرتبط برای prefill در این projection وجود ندارد." : "No relevant revision-bound prefill candidate is available in this projection."}
        </p>
      )}

      {candidate.requiredIssues.map((issue) => (
        <p className={styles.issue} key={`${issue.key}:${issue.reason}`}>
          {issueLabel(issue.reason, fa)} {fa ? "این مقدار باید توسط پزشک در فرم بررسی/وارد شود." : "The clinician must review or enter this value in the form."}
        </p>
      ))}

      <p className={styles.note}>
        {fa
          ? "Target HbA1c و سایر ترجیحات درمانی از Patient Core پر نمی‌شوند و همچنان ورودی مستقیم پزشک هستند."
          : "Target HbA1c and treatment preferences are not populated from Patient Core and remain direct clinician inputs."}
      </p>

      <div className={styles.actions}>
        <button className={styles.discard} onClick={onDiscard} type="button">
          {fa ? "رد کردن handoff" : "Discard handoff"}
        </button>
        <button className={styles.confirm} onClick={onConfirm} type="button">
          {fa ? "تأیید و اعمال candidateهای مجاز" : "Confirm and apply eligible candidates"}
        </button>
      </div>
    </section>
  );
}
