"use client";

import type {
  PatientChange,
  PatientCoreCollectionCompleteness,
  PatientLongitudinalReadModel,
} from "@glymize/contracts/patient-core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getPatientLongitudinalReadModel } from "../../../lib/patient-clinical-core-client";
import {
  buildPatientTenSecondBrief,
  isSourceFlaggedObservation,
  type PatientReviewPosture,
} from "../../../lib/patient-clinical-brief";
import { useGlymizeLocale } from "../../components/use-glymize-locale";
import styles from "./patient-clinical-workspace.module.css";
import { PatientWorkspaceC1Completion } from "./patient-workspace-c1-completion";

function formatDate(value: string | undefined, fa: boolean) {
  if (!value) return fa ? "ثبت نشده" : "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(fa ? "fa-IR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function patientName(model: PatientLongitudinalReadModel, fa: boolean) {
  const demographics = model.context.identity.patient.demographics;
  const name = [demographics?.firstName, demographics?.lastName]
    .filter(Boolean)
    .join(" ");
  return name || (fa ? "نام بیمار ثبت نشده" : "Patient name not recorded");
}

function identifierLabel(kind: string, fa: boolean) {
  if (kind === "national_id") return fa ? "کد ملی" : "National ID";
  if (kind === "file_number") return fa ? "شماره پرونده" : "File number";
  return fa ? "شناسه" : "Identifier";
}

function completenessLabel(value: PatientCoreCollectionCompleteness, fa: boolean) {
  if (value === "complete") return fa ? "کامل در منبع فعلی" : "Complete for current source";
  if (value === "partial") return fa ? "ناقص" : "Partial";
  return fa ? "در دسترس نیست" : "Not available";
}

function familyLabel(value: string, fa: boolean) {
  const labels: Record<string, [string, string]> = {
    allergies: ["حساسیت‌ها", "Allergies"],
    problems: ["مشکلات", "Problems"],
    medications: ["داروها", "Medications"],
    observations: ["آزمایش‌ها / مشاهدات", "Labs / observations"],
    clinical_contexts: ["زمینه‌های بالینی", "Clinical contexts"],
    timeline: ["خط زمانی", "Timeline"],
  };
  const label = labels[value] ?? [value, value];
  return fa ? label[0] : label[1];
}

function medicationStatusLabel(value: string, fa: boolean) {
  const labels: Record<string, [string, string]> = {
    active: ["فعال", "Active"],
    held: ["موقتاً متوقف", "Held"],
    stopped: ["قطع‌شده", "Stopped"],
    uncertain: ["نامشخص", "Uncertain"],
  };
  const label = labels[value] ?? [value, value];
  return fa ? label[0] : label[1];
}

function changeFamilyLabel(value: string, fa: boolean) {
  const labels: Record<string, [string, string]> = {
    allergy: ["حساسیت", "Allergy"],
    problem: ["مشکل", "Problem"],
    medication: ["دارو", "Medication"],
    observation: ["آزمایش / مشاهده", "Observation"],
    clinical_context: ["زمینه بالینی", "Clinical context"],
    patient_status: ["وضعیت پرونده", "Record status"],
    event: ["رویداد", "Event"],
  };
  const label = labels[value] ?? [value, value];
  return fa ? label[0] : label[1];
}

function changeKindLabel(value: string, fa: boolean) {
  if (value === "added") return fa ? "جدید" : "Added";
  if (value === "removed") return fa ? "حذف‌شده" : "Removed";
  return fa ? "تغییرکرده" : "Changed";
}

function postureCopy(posture: PatientReviewPosture, fa: boolean) {
  if (posture === "review_recorded_changes") {
    return {
      eyebrow: fa ? "نیاز به بازبینی" : "REVIEW POSTURE",
      title: fa ? "تغییرات ثبت‌شده را مرور کنید" : "Review recorded changes",
      description: fa
        ? "این وضعیت از تغییرات قابل‌مقایسه، داروی موقتاً متوقف/نامشخص یا آزمایش دارای پرچم منبع ساخته شده است؛ شدت بیماری را نتیجه‌گیری نمی‌کند."
        : "This posture is driven by comparable changes, held/uncertain medication, or source-flagged observations. It does not infer disease severity.",
    };
  }
  if (posture === "first_recorded_encounter") {
    return {
      eyebrow: fa ? "خط پایه" : "BASELINE",
      title: fa ? "ویزیت فعلی خط پایه است" : "Current encounter is the baseline",
      description: fa
        ? "برای مقایسه طولی هنوز ویزیت قبلی قابل‌مقایسه وجود ندارد."
        : "There is no earlier comparable encounter for longitudinal change detection yet.",
    };
  }
  if (posture === "coverage_limited") {
    return {
      eyebrow: fa ? "پوشش داده محدود" : "LIMITED COVERAGE",
      title: fa ? "تصویر بالینی فعلی ناقص است" : "The current clinical picture is incomplete",
      description: fa
        ? "برخی خانواده‌های داده ناقص یا در این projection در دسترس نیستند. نبود داده به معنی نبود بیماری یا درمان نیست."
        : "Some data families are partial or unavailable to this projection. Missing data is not evidence of clinical absence.",
    };
  }
  return {
    eyebrow: fa ? "تصویر ثبت‌شده فعلی" : "CURRENT SNAPSHOT",
    title: fa ? "تصویر ثبت‌شده فعلی در دسترس است" : "Current recorded snapshot available",
    description: fa
      ? "در داده‌های قابل‌مقایسه trigger ثبت‌شده‌ای برای بازبینی دیده نشد؛ این عبارت به معنی پایداری بالینی بیمار نیست."
      : "No review trigger was found in comparable recorded data. This does not mean the patient is clinically stable.",
  };
}

function deltaText(change: PatientChange, fa: boolean) {
  if (!change.deltas?.length) return null;
  return change.deltas.slice(0, 2).map((delta) => {
    const before = delta.before ?? (fa ? "—" : "—");
    const after = delta.after ?? (fa ? "—" : "—");
    return `${delta.field}: ${String(before)} → ${String(after)}`;
  }).join(" · ");
}

export default function PatientClinicalWorkspace({ patientId }: { patientId: string }) {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";
  const [model, setModel] = useState<PatientLongitudinalReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setModel(await getPatientLongitudinalReadModel(patientId));
    } catch (cause) {
      setModel(null);
      setError(cause instanceof Error ? cause.message : "PATIENT_LONGITUDINAL_READ_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // patientId is the route identity for this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const brief = useMemo(() => model ? buildPatientTenSecondBrief(model) : null, [model]);

  if (loading) {
    return (
      <main className={styles.statePage} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
        <div className={styles.stateCard}>
          <span>GLYMIZE · PATIENT</span>
          <strong>{fa ? "در حال ساخت نمای طولی بیمار…" : "Building longitudinal patient view…"}</strong>
        </div>
      </main>
    );
  }

  if (!model || !brief) {
    return (
      <main className={styles.statePage} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
        <div className={styles.stateCard}>
          <span>PATIENT WORKSPACE</span>
          <strong>{fa ? "پرونده قابل نمایش نیست" : "Patient workspace is unavailable"}</strong>
          <small>{error}</small>
          <div className={styles.stateActions}>
            <button type="button" onClick={() => void load()}>{fa ? "تلاش دوباره" : "Retry"}</button>
            <Link href="/records">{fa ? "بازگشت به بیماران" : "Back to patients"}</Link>
          </div>
        </div>
      </main>
    );
  }

  const patient = model.context.identity.patient;
  const demographics = patient.demographics;
  const primaryIdentifier = patient.identifiers.find((item) => item.isPrimary) ?? patient.identifiers[0];
  const posture = postureCopy(brief.posture, fa);
  const currentMedications = model.context.medications.items.filter((item) => item.status !== "stopped");
  const attentionMedications = currentMedications.filter(
    (item) => item.status === "held" || item.status === "uncertain",
  );
  const latestObservations = [...model.context.observations.items]
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, 8);
  const flaggedObservations = latestObservations.filter((item) =>
    isSourceFlaggedObservation(item.abnormalFlag),
  );
  const presentContexts = model.context.clinicalContexts.items.filter((item) => item.state === "present");
  const changes = model.changesSincePreviousEncounter.changes;
  const recentEvents = model.timeline.items.slice(0, 8);

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.patientStrip} data-patient-workspace="persistent-patient-strip">
        <div className={styles.patientIdentity}>
          <Link className={styles.backLink} href="/records">{fa ? "بیماران" : "Patients"}</Link>
          <div>
            <span>GLYMIZE · PATIENT WORKSPACE</span>
            <h1>{patientName(model, fa)}</h1>
          </div>
        </div>
        <div className={styles.stripFacts}>
          <div>
            <span>{primaryIdentifier ? identifierLabel(primaryIdentifier.kind, fa) : (fa ? "شناسه" : "Identifier")}</span>
            <strong>{primaryIdentifier?.displayMask ?? "—"}</strong>
          </div>
          <div>
            <span>{fa ? "تاریخ تولد" : "Date of birth"}</span>
            <strong>{formatDate(demographics?.dateOfBirth, fa)}</strong>
          </div>
          <div>
            <span>{fa ? "آخرین ویزیت" : "Latest encounter"}</span>
            <strong>{formatDate(patient.latestEncounterAt, fa)}</strong>
          </div>
          <div>
            <span>{fa ? "وضعیت پرونده" : "Record"}</span>
            <strong>{patient.status === "active" ? (fa ? "فعال" : "Active") : (fa ? "بایگانی" : "Archived")}</strong>
          </div>
        </div>
      </header>

      <section className={styles.brief} data-review-posture={brief.posture} data-patient-workspace="ten-second-brief">
        <div className={styles.briefPrimary}>
          <span className={styles.eyebrow}>{posture.eyebrow}</span>
          <h2>{posture.title}</h2>
          <p>{posture.description}</p>
          <div className={styles.asOf}>
            {fa ? "نمای داده تا" : "Data view generated"} {formatDate(model.generatedAt, fa)}
          </div>
        </div>
        <div className={styles.signalGrid}>
          <article>
            <b>{brief.recordedChangeCount}</b>
            <span>{fa ? "تغییر قابل‌مقایسه" : "recorded changes"}</span>
          </article>
          <article>
            <b>{brief.medicationAttentionCount}</b>
            <span>{fa ? "داروی held / نامشخص" : "held / uncertain meds"}</span>
          </article>
          <article>
            <b>{brief.flaggedObservationCount}</b>
            <span>{fa ? "نتیجه دارای پرچم منبع" : "source-flagged results"}</span>
          </article>
          <article>
            <b>{brief.incompleteFamilyCount}</b>
            <span>{fa ? "خانواده داده ناقص" : "incomplete data families"}</span>
          </article>
        </div>
      </section>

      <section className={styles.attention} data-patient-workspace="attention-now">
        <div className={styles.sectionTitle}>
          <div>
            <span>ATTENTION NOW</span>
            <h2>{fa ? "الان چه چیزی نیاز به نگاه دارد؟" : "What deserves a look now?"}</h2>
          </div>
          <small>{fa ? "فقط وضعیت‌های ثبت‌شده؛ بدون استنباط شدت بالینی" : "Recorded states only; no inferred clinical severity"}</small>
        </div>
        <div className={styles.attentionGrid}>
          {changes.length > 0 && (
            <article data-tone="review">
              <span>{fa ? "تغییرات" : "Changes"}</span>
              <strong>{changes.length} {fa ? "تغییر ثبت‌شده" : "recorded changes"}</strong>
              <small>{changes.slice(0, 3).map((item) => item.displayName).join(" · ")}</small>
            </article>
          )}
          {attentionMedications.length > 0 && (
            <article data-tone="review">
              <span>{fa ? "دارو" : "Medication"}</span>
              <strong>{attentionMedications.length} {fa ? "مورد برای reconciliation" : "items to reconcile"}</strong>
              <small>{attentionMedications.slice(0, 3).map((item) => item.displayName).join(" · ")}</small>
            </article>
          )}
          {flaggedObservations.length > 0 && (
            <article data-tone="review">
              <span>{fa ? "آزمایش" : "Observations"}</span>
              <strong>{flaggedObservations.length} {fa ? "نتیجه دارای flag" : "source-flagged results"}</strong>
              <small>{flaggedObservations.slice(0, 3).map((item) => `${item.displayName} ${item.abnormalFlag ?? ""}`).join(" · ")}</small>
            </article>
          )}
          {brief.incompleteFamilyCount > 0 && (
            <article data-tone="uncertain">
              <span>{fa ? "عدم قطعیت داده" : "Data uncertainty"}</span>
              <strong>{brief.incompleteFamilyCount} {fa ? "خانواده کامل نیست" : "families are not complete"}</strong>
              <small>{brief.coverage.filter((item) => item.completeness !== "complete").map((item) => familyLabel(item.family, fa)).join(" · ")}</small>
            </article>
          )}
          {changes.length === 0 && attentionMedications.length === 0 && flaggedObservations.length === 0 && brief.incompleteFamilyCount === 0 && (
            <article data-tone="neutral">
              <span>{fa ? "داده ثبت‌شده" : "Recorded data"}</span>
              <strong>{fa ? "trigger ثبت‌شده‌ای برای بازبینی دیده نشد" : "No recorded review trigger found"}</strong>
              <small>{fa ? "این عبارت معادل پایداری بالینی نیست." : "This is not equivalent to clinical stability."}</small>
            </article>
          )}
        </div>
      </section>

      <div className={styles.primaryGrid}>
        <section className={styles.panel} data-patient-workspace="what-changed">
          <div className={styles.sectionTitle}>
            <div>
              <span>WHAT CHANGED</span>
              <h2>{fa ? "از ویزیت قابل‌مقایسه قبلی" : "Since the previous comparable encounter"}</h2>
            </div>
            <small>{model.changesSincePreviousEncounter.comparisonStatus}</small>
          </div>
          {changes.length === 0 ? (
            <div className={styles.emptyState}>
              {model.changesSincePreviousEncounter.comparisonStatus === "unavailable"
                ? (fa ? "مقایسه طولی هنوز در دسترس نیست." : "Longitudinal comparison is not available yet.")
                : (fa ? "تفاوت ثبت‌شده‌ای در داده قابل‌مقایسه پیدا نشد." : "No recorded difference was found in comparable data.")}
            </div>
          ) : (
            <div className={styles.changeList}>
              {changes.slice(0, 6).map((change) => (
                <article key={change.changeId}>
                  <div>
                    <span>{changeFamilyLabel(change.family, fa)}</span>
                    <strong>{change.displayName}</strong>
                    {deltaText(change, fa) && <small>{deltaText(change, fa)}</small>}
                  </div>
                  <b>{changeKindLabel(change.kind, fa)}</b>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel} data-patient-workspace="clinical-contexts">
          <div className={styles.sectionTitle}>
            <div>
              <span>CURRENT CONTEXT</span>
              <h2>{fa ? "زمینه‌های بالینی شناخته‌شده" : "Known clinical contexts"}</h2>
            </div>
            <small>{completenessLabel(model.context.clinicalContexts.completeness, fa)}</small>
          </div>
          {presentContexts.length === 0 ? (
            <div className={styles.emptyState}>
              {fa
                ? "در projection فعلی context حاضر ثبت نشده؛ این به معنی نبود همه contextهای بالینی نیست."
                : "No present context is exposed by the current projection; this is not proof that all contexts are absent."}
            </div>
          ) : (
            <div className={styles.contextChips}>
              {presentContexts.map((context) => (
                <span key={context.factId}>{context.displayName}</span>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={styles.currentState} data-patient-workspace="current-clinical-picture">
        <div className={styles.sectionTitle}>
          <div>
            <span>CURRENT CLINICAL PICTURE</span>
            <h2>{fa ? "داده فعلی، بدون جست‌وجوی بین تب‌ها" : "Current facts without hunting through tabs"}</h2>
          </div>
          <small>{fa ? "جزئیات کامل در لایه‌های پایین‌تر" : "Full detail remains available below"}</small>
        </div>

        <div className={styles.currentGrid}>
          <article className={styles.currentCard}>
            <header>
              <div>
                <span>{fa ? "داروها" : "MEDICATIONS"}</span>
                <strong>{currentMedications.length}</strong>
              </div>
              <small>{completenessLabel(model.context.medications.completeness, fa)}</small>
            </header>
            <div className={styles.compactList}>
              {currentMedications.length === 0 ? (
                <p>{fa ? "داروی current در این projection ثبت نشده است." : "No current medication is exposed by this projection."}</p>
              ) : currentMedications.slice(0, 6).map((medication) => (
                <div key={medication.factId}>
                  <div>
                    <strong>{medication.displayName}</strong>
                    <small>{[medication.dose, medication.frequency].filter(Boolean).join(" · ") || (fa ? "جزئیات دوز ثبت نشده" : "Dose details not recorded")}</small>
                  </div>
                  <span data-state={medication.status}>{medicationStatusLabel(medication.status, fa)}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.currentCard}>
            <header>
              <div>
                <span>{fa ? "آخرین نتایج" : "LATEST OBSERVATIONS"}</span>
                <strong>{model.context.observations.items.length}</strong>
              </div>
              <small>{completenessLabel(model.context.observations.completeness, fa)}</small>
            </header>
            <div className={styles.observationGrid}>
              {latestObservations.length === 0 ? (
                <p>{fa ? "نتیجه‌ای در projection فعلی ثبت نشده است." : "No observations are exposed by the current projection."}</p>
              ) : latestObservations.map((observation) => (
                <div key={observation.factId} data-flagged={isSourceFlaggedObservation(observation.abnormalFlag)}>
                  <span>{observation.displayName}</span>
                  <strong>{String(observation.value)} {observation.unit ?? ""}</strong>
                  <small>{observation.abnormalFlag ? `${fa ? "flag" : "flag"}: ${observation.abnormalFlag} · ` : ""}{formatDate(observation.observedAt, fa)}</small>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <PatientWorkspaceC1Completion model={model} patientId={patientId} locale={locale} />

      <div className={styles.lowerGrid}>
        <section className={styles.panel} data-patient-workspace="timeline">
          <div className={styles.sectionTitle}>
            <div>
              <span>LONGITUDINAL STORY</span>
              <h2>{fa ? "رویدادهای اخیر" : "Recent timeline"}</h2>
            </div>
            <small>{completenessLabel(model.timeline.completeness, fa)}</small>
          </div>
          <div className={styles.timeline}>
            {recentEvents.length === 0 ? (
              <div className={styles.emptyState}>{fa ? "رویدادی ثبت نشده است." : "No timeline events are recorded."}</div>
            ) : recentEvents.map((event) => (
              <article key={event.eventId}>
                <time>{formatDate(event.effectiveAt, fa)}</time>
                <div>
                  <strong>{event.label ?? event.eventType}</strong>
                  <small>{event.eventType}{event.status ? ` · ${event.status}` : ""}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.panel} data-patient-workspace="data-coverage">
          <div className={styles.sectionTitle}>
            <div>
              <span>DATA COVERAGE</span>
              <h2>{fa ? "چه چیزی را می‌دانیم و چه چیزی ناقص است؟" : "What is known, partial, or unavailable?"}</h2>
            </div>
          </div>
          <div className={styles.coverageList}>
            {brief.coverage.map((item) => (
              <div key={item.family} data-completeness={item.completeness}>
                <strong>{familyLabel(item.family, fa)}</strong>
                <span>{completenessLabel(item.completeness, fa)}</span>
              </div>
            ))}
          </div>
          <p className={styles.coverageNote}>
            {fa
              ? "Complete فقط به معنی کامل‌بودن در scope منبع فعلی است، نه کامل‌بودن کل تاریخچه پزشکی بیمار."
              : "Complete means complete for the declared current source scope, not globally complete medical history."}
          </p>
        </section>
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>{fa ? "این صفحه تصمیم بالینی مستقل تولید نمی‌کند." : "This page does not generate autonomous clinical decisions."}</strong>
          <small>{fa ? "Clinical Modules معتبر در مراحل بعد سیگنال‌های evidence-bound را به این workspace اضافه می‌کنند." : "Reviewed Clinical Modules can later add evidence-bound signals to this workspace."}</small>
        </div>
        <button type="button" onClick={() => void load()}>{fa ? "به‌روزرسانی داده" : "Refresh data"}</button>
      </footer>
    </main>
  );
}
