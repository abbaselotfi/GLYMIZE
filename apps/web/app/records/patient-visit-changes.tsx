"use client";

import type {
  PatientVisitChangeItem,
  PatientVisitChangeSummary,
} from "../../lib/patient-visit-change-summary";
import styles from "./patient-visit-changes.module.css";

function formatDate(value: string, fa: boolean) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(fa ? "fa-IR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function itemLabel(item: PatientVisitChangeItem, fa: boolean) {
  if (item.kind !== "vital") return item.label;
  if (item.key === "weight") return fa ? "وزن" : "Weight";
  if (item.key === "blood_pressure") return fa ? "فشار خون" : "Blood pressure";
  return fa ? "نبض" : "Pulse";
}

function medicationChangeLabel(
  change: Extract<PatientVisitChangeItem, { kind: "medication" }>["change"],
  fa: boolean,
) {
  if (change === "added") return fa ? "اضافه‌شده" : "Added";
  if (change === "removed") return fa ? "حذف‌شده از فهرست" : "Removed from list";
  return fa ? "جزئیات ثبت‌شده تغییر کرده" : "Recorded details changed";
}

export function PatientVisitChanges({
  summary,
  loading,
  encounterCount,
  locale,
}: {
  summary: PatientVisitChangeSummary | null;
  loading: boolean;
  encounterCount: number;
  locale: "fa" | "en";
}) {
  const fa = locale === "fa";

  return (
    <section className={styles.panel} data-patient-workspace="visit-changes">
      <header className={styles.header}>
        <div>
          <span>WHAT CHANGED</span>
          <h3>{fa ? "چه چیزی از ویزیت قبل تغییر کرده؟" : "What changed since the last visit?"}</h3>
        </div>
        <small>
          {fa
            ? "فقط تفاوت‌های ثبت‌شده و قابل‌مقایسه نشان داده می‌شوند؛ این بخش درباره بهتر/بدتر شدن، اهمیت بالینی یا علت تغییر نتیجه‌گیری نمی‌کند."
            : "Only recorded, comparable differences are shown. This view does not infer improvement, worsening, clinical significance, or causality."}
        </small>
      </header>

      {encounterCount < 2 ? (
        <div className={styles.empty}>
          {fa
            ? "برای مقایسه، حداقل دو ویزیت در Patient Record v2 لازم است."
            : "At least two Patient Record v2 visits are required for comparison."}
        </div>
      ) : loading ? (
        <div className={styles.empty}>{fa ? "در حال مقایسه دو ویزیت آخر…" : "Comparing the latest two visits…"}</div>
      ) : !summary ? (
        <div className={styles.empty}>
          {fa ? "جزئیات قابل‌مقایسه دو ویزیت در دسترس نیست." : "Comparable details for the two visits are unavailable."}
        </div>
      ) : (
        <>
          <div className={styles.period}>
            <span>{formatDate(summary.previousAt, fa)}</span>
            <b aria-hidden="true">→</b>
            <span>{formatDate(summary.currentAt, fa)}</span>
          </div>

          {summary.changes.length === 0 ? (
            <div className={styles.empty}>
              {fa
                ? "در فیلدهای قابل‌مقایسه، تفاوت ثبت‌شده‌ای پیدا نشد."
                : "No recorded differences were found in comparable fields."}
            </div>
          ) : (
            <div className={styles.list}>
              {summary.changes.map((item) => (
                <article className={styles.item} key={`${item.kind}:${item.key}`}>
                  <div>
                    <strong>{itemLabel(item, fa)}</strong>
                    {item.kind === "lab" && item.specimen && <small>{item.specimen}</small>}
                    {item.kind === "medication" && (
                      <small>{medicationChangeLabel(item.change, fa)}</small>
                    )}
                  </div>

                  {item.kind === "medication" ? (
                    <div className={styles.values}>
                      {item.previousValue && <span>{item.previousValue}</span>}
                      {item.previousValue && item.currentValue && <b aria-hidden="true">→</b>}
                      {item.currentValue && <span>{item.currentValue}</span>}
                    </div>
                  ) : (
                    <div className={styles.values}>
                      <span>{item.previousValue} {item.unit}</span>
                      <b aria-hidden="true">→</b>
                      <span>{item.currentValue} {item.unit}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
