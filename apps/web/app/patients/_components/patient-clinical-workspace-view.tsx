"use client";

import type {
  PatientChange,
  PatientCoreCollectionCompleteness,
  PatientLongitudinalReadModel,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import Link from "next/link";
import { useMemo } from "react";
import {
  buildPatientTenSecondBrief,
  type PatientReviewPosture,
} from "../../../lib/patient-clinical-brief";
import {
  buildPatientWorkspaceSelection,
  isSourceFlaggedObservation,
} from "../../../lib/patient-workspace-selection";
import styles from "./patient-clinical-workspace.module.css";
import { PatientSourceDetails } from "./patient-source-details";
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
  const name = [demographics?.firstName, demographics?.lastName].filter(Boolean).join(" ");
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
  const item = labels[value] ?? [value, value];
  return fa ? item[0] : item[1];
}

function medicationStatusLabel(value: string, fa: boolean) {
  const labels: Record<string, [string, string]> = {
    active: ["فعال", "Active"],
    held: ["موقتاً متوقف", "Held"],
    stopped: ["قطع‌شده", "Stopped"],
    uncertain: ["نامشخص", "Uncertain"],
  };
  const item = labels[value] ?? [value, value];
  return fa ? item[0] : item[1];
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
  const item = labels[value] ?? [value, value];
  return fa ? item[0] : item[1];
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
      title: fa ? "داده‌های ثبت‌شده نیاز به مرور دارند" : "Recorded data deserves review",
      description: fa
        ? "تغییر قابل‌مقایسه، داروی held/نامشخص، finding فعلی دارای flag منبع یا finding تأییدنشده دیده شده است؛ این وضعیت شدت بیماری را نتیجه‌گیری نمی‌کند."
        : "Comparable changes, held/uncertain medication, a current source-flagged finding, or unverified current data is present. This does not infer disease severity.",
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
      ? "در داده‌های فعلی قابل‌مقایسه trigger ثبت‌شده‌ای برای بازبینی دیده نشد؛ این عبارت به معنی پایداری بالینی بیمار نیست."
      : "No review trigger was found in current comparable recorded data. This does not mean the patient is clinically stable.",
  };
}

function deltaText(change: PatientChange) {
  if (!change.deltas?.length) return null;
  return change.deltas
    .slice(0, 2)
    .map((delta) => `${delta.field}: ${String(delta.before ?? "—")} → ${String(delta.after ?? "—")}`)
    .join(" · ");
}

function observationLine(observation: PatientObservationView, fa: boolean) {
  return `${observation.displayName}: ${String(observation.value)}${observation.unit ? ` ${observation.unit}` : ""} · ${observation.meta.verification} · ${observation.meta.freshness}${observation.abnormalFlag ? ` · flag ${observation.abnormalFlag}` : ""} · ${formatDate(observation.observedAt, fa)}`;
}

export function PatientClinicalWorkspaceView({
  model,
  patientId,
  locale,
  onRefresh,
}: {
  model: PatientLongitudinalReadModel;
  patientId: string;
  locale: "fa" | "en";
  onRefresh: () => void;
}) {
  const fa = locale === "fa";
  const selection = useMemo(() => buildPatientWorkspaceSelection(model), [model]);
  const brief = useMemo(() => buildPatientTenSecondBrief(model, selection), [model, selection]);
  const patient = model.context.identity.patient;
  const demographics = patient.demographics;
  const primaryIdentifier = patient.identifiers.find((item) => item.isPrimary) ?? patient.identifiers[0];
  const posture = postureCopy(brief.posture, fa);
  const presentContexts = model.context.clinicalContexts.items.filter((item) => item.state === "present");
  const comparisonRevision = (change: PatientChange) =>
    change.kind === "removed"
      ? model.changesSincePreviousEncounter.baseline?.snapshotRevision
      : model.changesSincePreviousEncounter.current?.snapshotRevision;

  return (
    <main className={styles.page} dir={fa ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.patientStrip} data-patient-workspace="persistent-patient-strip">
        <div className={styles.patientIdentity}>
          <Link className={styles.backLink} href="/records">{fa ? "بیماران" : "Patients"}</Link>
          <div>
            <span>GLYMIZE · PATIENT WORKSPACE</span>
            <h1>{patientName(model, fa)}</h1>
          </div>
        </div>
        <div className={styles.stripFacts}>
          <div><span>{primaryIdentifier ? identifierLabel(primaryIdentifier.kind, fa) : (fa ? "شناسه" : "Identifier")}</span><strong>{primaryIdentifier?.displayMask ?? "—"}</strong></div>
          <div><span>{fa ? "تاریخ تولد" : "Date of birth"}</span><strong>{formatDate(demographics?.dateOfBirth, fa)}</strong></div>
          <div><span>{fa ? "آخرین ویزیت" : "Latest encounter"}</span><strong>{formatDate(patient.latestEncounterAt, fa)}</strong></div>
          <div><span>{fa ? "وضعیت پرونده" : "Record"}</span><strong>{patient.status === "active" ? (fa ? "فعال" : "Active") : (fa ? "بایگانی" : "Archived")}</strong></div>
        </div>
      </header>

      <section className={styles.brief} data-review-posture={brief.posture} data-patient-workspace="ten-second-brief">
        <div className={styles.briefPrimary}>
          <span className={styles.eyebrow}>{posture.eyebrow}</span>
          <h2>{posture.title}</h2>
          <p>{posture.description}</p>
          <div className={styles.asOf}>{fa ? "نمای داده تا" : "Data view generated"} {formatDate(model.generatedAt, fa)}</div>
        </div>
        <div className={styles.signalGrid}>
          <article><b>{brief.recordedChangeCount}</b><span>{fa ? "تغییر قابل‌مقایسه" : "recorded changes"}</span></article>
          <article><b>{brief.medicationAttentionCount}</b><span>{fa ? "داروی held / نامشخص" : "held / uncertain meds"}</span></article>
          <article><b>{brief.flaggedObservationCount}</b><span>{fa ? "finding فعلی دارای flag" : "current source flags"}</span></article>
          <article><b>{brief.unverifiedObservationCount}</b><span>{fa ? "finding فعلی تأییدنشده" : "current unverified findings"}</span></article>
          <article><b>{brief.incompleteFamilyCount}</b><span>{fa ? "خانواده داده ناقص" : "incomplete data families"}</span></article>
        </div>
      </section>

      <section className={styles.attention} data-patient-workspace="attention-now">
        <div className={styles.sectionTitle}>
          <div><span>ATTENTION NOW</span><h2>{fa ? "الان چه چیزی نیاز به نگاه دارد؟" : "What deserves a look now?"}</h2></div>
          <small>{fa ? "finding فعلی؛ تاریخچه جدا نگه داشته می‌شود" : "Current findings; history is kept separate"}</small>
        </div>
        <div className={styles.attentionGrid}>
          {selection.changes.items.length > 0 && <article data-tone="review"><span>{fa ? "تغییرات" : "Changes"}</span><strong>{selection.changes.items.length} {fa ? "تغییر ثبت‌شده" : "recorded changes"}</strong><small>{selection.changes.preview.map((item) => item.displayName).join(" · ")}</small></article>}
          {selection.attentionMedications.items.length > 0 && <article data-tone="review"><span>{fa ? "دارو" : "Medication"}</span><strong>{selection.attentionMedications.items.length} {fa ? "مورد برای reconciliation" : "items to reconcile"}</strong><small>{selection.attentionMedications.preview.map((item) => item.displayName).join(" · ")}</small></article>}
          {selection.currentFlaggedObservations.items.length > 0 && <article data-tone="review"><span>{fa ? "آزمایش" : "Observations"}</span><strong>{selection.currentFlaggedObservations.items.length} {fa ? "finding فعلی دارای flag" : "current source-flagged findings"}</strong><small>{selection.currentFlaggedObservations.preview.map((item) => `${item.displayName} ${item.abnormalFlag ?? ""}`).join(" · ")}</small></article>}
          {selection.currentUnverifiedObservations.items.length > 0 && <article data-tone="uncertain"><span>{fa ? "تأیید داده" : "Verification"}</span><strong>{selection.currentUnverifiedObservations.items.length} {fa ? "finding فعلی تأییدنشده" : "current findings are unverified"}</strong><small>{selection.currentUnverifiedObservations.preview.map((item) => item.displayName).join(" · ")}</small></article>}
          {brief.incompleteFamilyCount > 0 && <article data-tone="uncertain"><span>{fa ? "عدم قطعیت داده" : "Data uncertainty"}</span><strong>{brief.incompleteFamilyCount} {fa ? "خانواده کامل نیست" : "families are not complete"}</strong><small>{brief.coverage.filter((item) => item.completeness !== "complete").map((item) => familyLabel(item.family, fa)).join(" · ")}</small></article>}
          {brief.recordedChangeCount === 0 && brief.medicationAttentionCount === 0 && brief.flaggedObservationCount === 0 && brief.unverifiedObservationCount === 0 && brief.incompleteFamilyCount === 0 && <article data-tone="neutral"><span>{fa ? "داده ثبت‌شده" : "Recorded data"}</span><strong>{fa ? "trigger ثبت‌شده‌ای برای بازبینی دیده نشد" : "No recorded review trigger found"}</strong><small>{fa ? "این عبارت معادل پایداری بالینی نیست." : "This is not equivalent to clinical stability."}</small></article>}
        </div>
        {brief.historicalFlaggedObservationCount > 0 && (
          <details>
            <summary>{fa ? `${brief.historicalFlaggedObservationCount} flag تاریخی — finding فعلی محسوب نمی‌شود` : `${brief.historicalFlaggedObservationCount} historical flags — not counted as current`}</summary>
            {selection.historicalFlaggedObservations.map((item) => (
              <div key={item.factId}>
                <p>{observationLine(item, fa)}</p>
                <PatientSourceDetails meta={item.meta} locale={locale} />
              </div>
            ))}
          </details>
        )}
      </section>

      <div className={styles.primaryGrid}>
        <section className={styles.panel} data-patient-workspace="what-changed">
          <div className={styles.sectionTitle}><div><span>WHAT CHANGED</span><h2>{fa ? "از ویزیت قابل‌مقایسه قبلی" : "Since the previous comparable encounter"}</h2></div><small>{model.changesSincePreviousEncounter.comparisonStatus}</small></div>
          {selection.changes.items.length === 0 ? (
            <div className={styles.emptyState}>{model.changesSincePreviousEncounter.comparisonStatus === "unavailable" ? (fa ? "مقایسه طولی هنوز در دسترس نیست." : "Longitudinal comparison is not available yet.") : (fa ? "تفاوت ثبت‌شده‌ای در داده قابل‌مقایسه پیدا نشد." : "No recorded difference was found in comparable data.")}</div>
          ) : (
            <div className={styles.changeList}>
              {selection.changes.preview.map((change) => (
                <article key={change.changeId}>
                  <div><span>{changeFamilyLabel(change.family, fa)}</span><strong>{change.displayName}</strong>{deltaText(change) && <small>{deltaText(change)}</small>}<PatientSourceDetails source={change.source} revision={comparisonRevision(change)} locale={locale} /></div>
                  <b>{changeKindLabel(change.kind, fa)}</b>
                </article>
              ))}
              {selection.changes.omittedCount > 0 && <details><summary>{fa ? `نمایش ${selection.changes.omittedCount} تغییر دیگر` : `Show ${selection.changes.omittedCount} more changes`}</summary>{selection.changes.omitted.map((change) => <article key={change.changeId}><div><strong>{change.displayName}</strong>{deltaText(change) && <small>{deltaText(change)}</small>}<PatientSourceDetails source={change.source} revision={comparisonRevision(change)} locale={locale} /></div><b>{changeKindLabel(change.kind, fa)}</b></article>)}</details>}
            </div>
          )}
        </section>

        <section className={styles.panel} data-patient-workspace="clinical-contexts">
          <div className={styles.sectionTitle}><div><span>CURRENT CONTEXT</span><h2>{fa ? "زمینه‌های بالینی شناخته‌شده" : "Known clinical contexts"}</h2></div><small>{completenessLabel(model.context.clinicalContexts.completeness, fa)}</small></div>
          {presentContexts.length === 0 ? <div className={styles.emptyState}>{fa ? "در projection فعلی context حاضر ثبت نشده؛ این به معنی نبود همه contextهای بالینی نیست." : "No present context is exposed by the current projection; this is not proof that all contexts are absent."}</div> : <div className={styles.compactList}>{presentContexts.map((context) => <div key={context.factId}><div><strong>{context.displayName}</strong><small>{context.meta.verification} · {context.meta.freshness}</small><PatientSourceDetails meta={context.meta} locale={locale} /></div></div>)}</div>}
        </section>
      </div>

      <section className={styles.currentState} data-patient-workspace="current-clinical-picture">
        <div className={styles.sectionTitle}><div><span>CURRENT CLINICAL PICTURE</span><h2>{fa ? "finding فعلی بر اساس series" : "Current findings by series"}</h2></div><small>{fa ? "جزئیات منبع قابل بازکردن است" : "Source detail is expandable"}</small></div>
        <div className={styles.currentGrid}>
          <article className={styles.currentCard}>
            <header><div><span>{fa ? "داروها" : "MEDICATIONS"}</span><strong>{selection.medications.items.length}</strong></div><small>{completenessLabel(model.context.medications.completeness, fa)}</small></header>
            <div className={styles.compactList}>{selection.medications.items.length === 0 ? <p>{fa ? "داروی current در این projection ثبت نشده است." : "No current medication is exposed by this projection."}</p> : selection.medications.preview.map((medication) => <div key={medication.factId}><div><strong>{medication.displayName}</strong><small>{[medication.dose, medication.frequency].filter(Boolean).join(" · ") || (fa ? "جزئیات دوز ثبت نشده" : "Dose details not recorded")} · {medication.meta.verification} · {medication.meta.freshness}</small><PatientSourceDetails meta={medication.meta} locale={locale} /></div><span data-state={medication.status}>{medicationStatusLabel(medication.status, fa)}</span></div>)}</div>
            {selection.medications.omittedCount > 0 && <details><summary>{fa ? `نمایش ${selection.medications.omittedCount} داروی دیگر` : `Show ${selection.medications.omittedCount} more medications`}</summary>{selection.medications.omitted.map((medication) => <div key={medication.factId}><p>{medication.displayName} · {medicationStatusLabel(medication.status, fa)}</p><PatientSourceDetails meta={medication.meta} locale={locale} /></div>)}</details>}
          </article>

          <article className={styles.currentCard}>
            <header><div><span>{fa ? "finding فعلی" : "CURRENT OBSERVATIONS"}</span><strong>{selection.currentObservations.items.length}</strong></div><small>{completenessLabel(model.context.observations.completeness, fa)}</small></header>
            <div className={styles.observationGrid}>{selection.currentObservations.items.length === 0 ? <p>{fa ? "نتیجه‌ای در projection فعلی ثبت نشده است." : "No observations are exposed by the current projection."}</p> : selection.currentObservations.preview.map((observation) => <div key={observation.factId} data-flagged={isSourceFlaggedObservation(observation.abnormalFlag)}><span>{observation.displayName}</span><strong>{String(observation.value)} {observation.unit ?? ""}</strong><small>{observation.meta.verification} · {observation.meta.freshness} · {observation.abnormalFlag ? `flag ${observation.abnormalFlag} · ` : ""}{formatDate(observation.observedAt, fa)}</small><PatientSourceDetails meta={observation.meta} locale={locale} /></div>)}</div>
            {selection.currentObservations.omittedCount > 0 && <details><summary>{fa ? `نمایش ${selection.currentObservations.omittedCount} series دیگر` : `Show ${selection.currentObservations.omittedCount} more series`}</summary>{selection.currentObservations.omitted.map((observation) => <div key={observation.factId}><p>{observationLine(observation, fa)}</p><PatientSourceDetails meta={observation.meta} locale={locale} /></div>)}</details>}
          </article>
        </div>
      </section>

      <PatientWorkspaceC1Completion model={model} patientId={patientId} locale={locale} />

      <div className={styles.lowerGrid}>
        <section className={styles.panel} data-patient-workspace="timeline">
          <div className={styles.sectionTitle}><div><span>LONGITUDINAL STORY</span><h2>{fa ? "رویدادهای اخیر" : "Recent timeline"}</h2></div><small>{completenessLabel(model.timeline.completeness, fa)}</small></div>
          <div className={styles.timeline}>{selection.timeline.items.length === 0 ? <div className={styles.emptyState}>{fa ? "رویدادی ثبت نشده است." : "No timeline events are recorded."}</div> : selection.timeline.preview.map((event) => <article key={event.eventId}><time>{formatDate(event.effectiveAt, fa)}</time><div><strong>{event.label ?? event.eventType}</strong><small>{event.eventType}{event.status ? ` · ${event.status}` : ""}</small><PatientSourceDetails source={event.source} locale={locale} /></div></article>)}</div>
          {selection.timeline.omittedCount > 0 && <details><summary>{fa ? `نمایش ${selection.timeline.omittedCount} رویداد دیگر` : `Show ${selection.timeline.omittedCount} more events`}</summary>{selection.timeline.omitted.map((event) => <div key={event.eventId}><p>{formatDate(event.effectiveAt, fa)} · {event.label ?? event.eventType}</p><PatientSourceDetails source={event.source} locale={locale} /></div>)}</details>}
        </section>

        <section className={styles.panel} data-patient-workspace="data-coverage">
          <div className={styles.sectionTitle}><div><span>DATA COVERAGE</span><h2>{fa ? "چه چیزی را می‌دانیم و چه چیزی ناقص است؟" : "What is known, partial, or unavailable?"}</h2></div></div>
          <div className={styles.coverageList}>{brief.coverage.map((item) => <div key={item.family} data-completeness={item.completeness}><strong>{familyLabel(item.family, fa)}</strong><span>{completenessLabel(item.completeness, fa)}</span></div>)}</div>
          <p className={styles.coverageNote}>{fa ? "Complete فقط به معنی کامل‌بودن در scope منبع فعلی است، نه کامل‌بودن کل تاریخچه پزشکی بیمار." : "Complete means complete for the declared current source scope, not globally complete medical history."}</p>
        </section>
      </div>

      <footer className={styles.footer}>
        <div><strong>{fa ? "این صفحه تصمیم بالینی مستقل تولید نمی‌کند." : "This page does not generate autonomous clinical decisions."}</strong><small>{fa ? "flag تاریخی از finding فعلی جداست و verification/freshness منبع قابل مشاهده است." : "Historical flags are separated from current findings and source verification/freshness is visible."}</small></div>
        <button type="button" onClick={onRefresh}>{fa ? "به‌روزرسانی داده" : "Refresh data"}</button>
      </footer>
    </main>
  );
}
