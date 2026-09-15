"use client";

import type {
  PatientCoreCollectionCompleteness,
  PatientLongitudinalReadModel,
  PatientProblemStatus,
} from "@glymize/contracts/patient-core";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CLINICAL_MODULE_REGISTRY,
  clinicalModuleMaturityLabel,
} from "../../../lib/clinical-module-registry";
import {
  clearPatientModuleHandoffIntent,
  createPatientModuleHandoffIntent,
  writePatientModuleHandoffIntent,
} from "../../../lib/patient-module-handoff";
import {
  buildType2PatientCoreHandoffCandidate,
  TYPE2_PATIENT_CORE_MODULE_ID,
} from "../../../lib/type2-patient-core-handoff";
import {
  buildPatientObservationTrends,
  type PatientObservationTrend,
} from "../../../lib/patient-observation-trends";
import styles from "./patient-workspace-c1-completion.module.css";

function completenessLabel(value: PatientCoreCollectionCompleteness, fa: boolean) {
  if (value === "complete") return fa ? "کامل در منبع فعلی" : "Complete for current source";
  if (value === "partial") return fa ? "ناقص" : "Partial";
  return fa ? "در دسترس نیست" : "Not available";
}

function problemStatusLabel(value: PatientProblemStatus, fa: boolean) {
  const labels: Record<PatientProblemStatus, [string, string]> = {
    active: ["فعال", "Active"],
    resolved: ["حل‌شده", "Resolved"],
    historical: ["سابقه", "Historical"],
    suspected: ["مشکوک", "Suspected"],
    unknown: ["نامشخص", "Unknown"],
  };
  return fa ? labels[value][0] : labels[value][1];
}

function directionLabel(trend: PatientObservationTrend, fa: boolean) {
  if (trend.direction === "up") return fa ? "افزایش عددی" : "Numeric increase";
  if (trend.direction === "down") return fa ? "کاهش عددی" : "Numeric decrease";
  return fa ? "بدون تغییر عددی" : "No numeric change";
}

function TrendSparkline({ trend }: { trend: PatientObservationTrend }) {
  const values = trend.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const denominator = Math.max(1, trend.points.length - 1);
  const points = trend.points
    .map((point, index) => {
      const x = (index / denominator) * 100;
      const normalized = span === 0 ? 0.5 : (point.value - min) / span;
      const y = 26 - normalized * 20;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      aria-label={`Numeric trend for ${trend.displayName}`}
      className={styles.sparkline}
      role="img"
      viewBox="0 0 100 32"
    >
      <polyline fill="none" points={points} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </svg>
  );
}

export function PatientWorkspaceC1Completion({
  model,
  patientId,
  locale,
}: {
  model: PatientLongitudinalReadModel;
  patientId: string;
  locale: "fa" | "en";
}) {
  const fa = locale === "fa";
  const [assistantOpen, setAssistantOpen] = useState(false);
  const trends = useMemo(
    () => buildPatientObservationTrends(model.context.observations.items, 4),
    [model.context.observations.items],
  );
  const problems = model.context.problems.items;
  const problemCoverageLimited = model.context.problems.completeness !== "complete";
  const currentMedicationCount = model.context.medications.items.filter(
    (item) => item.status !== "stopped",
  ).length;

  function prepareModuleNavigation(moduleId: string) {
    clearPatientModuleHandoffIntent();
    if (moduleId !== TYPE2_PATIENT_CORE_MODULE_ID) return;
    try {
      const candidate = buildType2PatientCoreHandoffCandidate(model);
      const intent = createPatientModuleHandoffIntent({
        moduleId: candidate.moduleId,
        practiceId: candidate.scope.practiceId,
        patientId: candidate.scope.patientId,
        sourceRevisions: candidate.sourceRevisions,
      });
      if (intent.sourceRevisionFingerprint !== candidate.sourceRevisionFingerprint) {
        return;
      }
      writePatientModuleHandoffIntent(intent);
    } catch {
      clearPatientModuleHandoffIntent();
    }
  }

  return (
    <section className={styles.completion} data-patient-workspace="c1-completion-surfaces">
      <div className={styles.twoColumn}>
        <article className={styles.panel} data-patient-workspace="problems">
          <header className={styles.panelHeader}>
            <div>
              <span>PROBLEMS</span>
              <h2>{fa ? "مشکلات و تشخیص‌های ثبت‌شده" : "Recorded problems and diagnoses"}</h2>
            </div>
            <small>{completenessLabel(model.context.problems.completeness, fa)}</small>
          </header>

          {problems.length > 0 ? (
            <div className={styles.problemList}>
              {problems.slice(0, 8).map((problem) => (
                <div key={problem.factId}>
                  <div>
                    <strong>{problem.displayName}</strong>
                    <small>{problem.coding?.display ?? problem.coding?.code ?? (fa ? "کد استاندارد ثبت نشده" : "No standard code recorded")}</small>
                  </div>
                  <span data-problem-status={problem.status}>{problemStatusLabel(problem.status, fa)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.explicitGap} data-coverage-limited={problemCoverageLimited}>
              <strong>
                {problemCoverageLimited
                  ? (fa ? "Problem authority در این projection کامل نیست" : "Problem authority is not complete in this projection")
                  : (fa ? "موردی در scope منبع فعلی ثبت نشده" : "No problem item is recorded in the current source scope")}
              </strong>
              <p>
                {fa
                  ? "نبود آیتم در این بخش هرگز به معنی نبود بیماری یا مشکل بالینی خارج از scope منبع فعلی نیست."
                  : "An empty list here is never proof that the patient has no disease or clinical problem outside the declared source scope."}
              </p>
            </div>
          )}
        </article>

        <article className={styles.panel} data-patient-workspace="trends">
          <header className={styles.panelHeader}>
            <div>
              <span>TRENDS</span>
              <h2>{fa ? "روندهای عددی تکرارشونده" : "Repeated numeric trends"}</h2>
            </div>
            <small>{completenessLabel(model.context.observations.completeness, fa)}</small>
          </header>

          {trends.length === 0 ? (
            <div className={styles.explicitGap}>
              <strong>{fa ? "برای trend حداقل دو مقدار عددی هم‌نوع لازم است" : "A trend needs at least two numeric values in the same series"}</strong>
              <p>{fa ? "در حال حاضر سری عددی تکرارشونده کافی در Patient Core موجود نیست." : "The Patient Core does not currently expose enough repeated numeric observations for a trend."}</p>
            </div>
          ) : (
            <div className={styles.trendList}>
              {trends.map((trend) => (
                <div key={trend.factKey} className={styles.trendRow}>
                  <div className={styles.trendIdentity}>
                    <strong>{trend.displayName}</strong>
                    <small>{trend.points.length} {fa ? "نقطه اخیر" : "recent points"}</small>
                  </div>
                  <TrendSparkline trend={trend} />
                  <div className={styles.trendValue}>
                    <strong>{trend.latest} {trend.unit ?? ""}</strong>
                    <small>{directionLabel(trend, fa)} · {trend.previous} → {trend.latest}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className={styles.safetyNote}>
            {fa
              ? "جهت بالا/پایین فقط تغییر عددی را نشان می‌دهد و تفسیر بالینی، target یا severity نیست."
              : "Up/down reflects arithmetic direction only; it is not a clinical interpretation, target, or severity assessment."}
          </p>
        </article>
      </div>

      <article className={styles.panel} data-patient-workspace="clinical-modules-launcher">
        <header className={styles.panelHeader}>
          <div>
            <span>CLINICAL MODULES</span>
            <h2>{fa ? "ورود کنترل‌شده از context بیمار" : "Governed entry from patient context"}</h2>
          </div>
          <small>{fa ? "maturity، authority و release جدا هستند" : "Maturity, authority, and release are separate"}</small>
        </header>
        <div className={styles.moduleGrid}>
          {CLINICAL_MODULE_REGISTRY.map((module) => (
            <Link
              className={styles.moduleCard}
              data-maturity={module.maturity}
              data-release-eligibility={module.releaseEligibility}
              data-treatment-authority={module.treatmentAuthority}
              href={module.route}
              key={module.id}
              onClick={() => prepareModuleNavigation(module.id)}
            >
              <div>
                <span>{clinicalModuleMaturityLabel(module.maturity, fa)}</span>
                <strong>{fa ? module.faTitle : module.enTitle}</strong>
              </div>
              <p>{fa ? module.faDescription : module.enDescription}</p>
              <b>{fa ? "باز کردن" : "Open"} →</b>
            </Link>
          ))}
        </div>
        <p className={styles.safetyNote}>
          {fa
            ? "برای Type 2 فقط descriptor شامل patient/practice و revision metadata در همین tab ساخته می‌شود؛ هیچ مقدار بالینی در URL یا transport ذخیره نمی‌شود. مقصد Patient Core را دوباره می‌خواند، revision را تطبیق می‌دهد و قبل از اعمال هر مقدار تأیید پزشک را می‌خواهد."
            : "For Type 2, only a same-tab descriptor containing patient/practice scope and revision metadata is created; no clinical value is stored in the URL or transport. The destination re-reads Patient Core, checks revisions, and requires clinician confirmation before applying any value."}
        </p>
      </article>

      <div className={styles.assistantDock} data-patient-workspace="contextual-ai-drawer">
        <div>
          <span>CONTEXTUAL AI</span>
          <strong>{fa ? "دستیار شواهد در context همین بیمار" : "Evidence assistant from this patient context"}</strong>
          <small>{fa ? "اتصال خودکار patient context فعلاً خاموش است." : "Automatic patient-context handoff is currently disabled."}</small>
        </div>
        <button
          aria-controls="patient-contextual-ai-drawer"
          aria-expanded={assistantOpen}
          onClick={() => setAssistantOpen((value) => !value)}
          type="button"
        >
          {assistantOpen ? (fa ? "بستن" : "Close") : (fa ? "باز کردن دستیار" : "Open assistant")}
        </button>
      </div>

      {assistantOpen && (
        <aside className={styles.assistantDrawer} id="patient-contextual-ai-drawer">
          <header>
            <div>
              <span>GLYMIZE EVIDENCE ASSISTANT</span>
              <h2>{fa ? "Context آماده است؛ ارسال خودکار نیست" : "Context is visible here; it is not auto-sent"}</h2>
            </div>
            <button aria-label={fa ? "بستن دستیار" : "Close assistant"} onClick={() => setAssistantOpen(false)} type="button">×</button>
          </header>

          <div className={styles.contextSummary}>
            <div><b>{currentMedicationCount}</b><span>{fa ? "داروی current" : "current meds"}</span></div>
            <div><b>{model.context.observations.items.length}</b><span>{fa ? "observation" : "observations"}</span></div>
            <div><b>{model.changesSincePreviousEncounter.changes.length}</b><span>{fa ? "تغییر ثبت‌شده" : "recorded changes"}</span></div>
          </div>

          <p>
            {fa
              ? "این drawer به همین Patient Workspace تعلق دارد، اما C1 هیچ داده بیمار را به endpoint دستیار شواهد ارسال نمی‌کند. اتصال واقعی باید بعداً از curated PatientContextView نسخه‌دار و با مرزهای privacy/authority انجام شود."
              : "This drawer belongs to this Patient Workspace, but C1 sends no patient data to the Evidence Assistant endpoint. Real handoff must later use a versioned curated PatientContextView with explicit privacy and authority boundaries."}
          </p>
          <p className={styles.patientKey}>Patient context: {patientId ? (fa ? "در workspace فعال" : "active in workspace") : "—"}</p>
          <Link className={styles.assistantLink} href="/evidence-assistant">
            {fa ? "باز کردن Evidence Assistant بدون ارسال خودکار context" : "Open Evidence Assistant without automatic context transfer"}
          </Link>
        </aside>
      )}
    </section>
  );
}
