"use client";

import type {
  PatientLongitudinalHistoryFamily,
  PatientLongitudinalReadModel,
} from "@glymize/contracts/patient-core";
import styles from "./patient-history-continuation.module.css";

export function PatientHistoryContinuation({
  model,
  locale,
  loadingFamily,
  error,
  onLoad,
}: {
  model: PatientLongitudinalReadModel;
  locale: string;
  loadingFamily: PatientLongitudinalHistoryFamily | null;
  error: string;
  onLoad: (family: PatientLongitudinalHistoryFamily) => void;
}) {
  const fa = locale === "fa";
  const observations = model.context.observations.continuation;
  const timeline = model.timeline.continuation;
  const choices: Array<{
    family: PatientLongitudinalHistoryFamily;
    label: string;
    continuation: typeof observations;
  }> = [
    {
      family: "observations",
      label: fa ? "مشاهدات و آزمایش‌های قدیمی‌تر" : "Older observations and labs",
      continuation: observations,
    },
    {
      family: "timeline",
      label: fa ? "رویدادهای قدیمی‌تر خط زمانی" : "Older timeline events",
      continuation: timeline,
    },
  ];
  const available = choices.filter((item) => item.continuation?.hasMore);
  if (!available.length && !error) return null;

  return (
    <section
      className={styles.wrap}
      dir={fa ? "rtl" : "ltr"}
      lang={locale}
      aria-label={fa ? "ادامه تاریخچه بیمار" : "Patient history continuation"}
    >
      <div className={styles.heading}>
        <div>
          <span>LONGITUDINAL HISTORY</span>
          <strong>{fa ? "ادامه تاریخچه در صورت نیاز" : "Inspect more history when needed"}</strong>
        </div>
        <small>
          {fa
            ? "نمای اولیه عمداً محدود است؛ وجود دکمه یعنی تاریخچه بیشتری در همان نسخه منبع باقی مانده است."
            : "The initial view is intentionally bounded; a button means more history remains under the same source version."}
        </small>
      </div>
      <div className={styles.actions}>
        {available.map(({ family, label, continuation }) => (
          <button
            key={family}
            type="button"
            disabled={loadingFamily !== null}
            onClick={() => onLoad(family)}
          >
            <strong>
              {loadingFamily === family
                ? (fa ? "در حال دریافت…" : "Loading…")
                : label}
            </strong>
            <span>
              {continuation?.remainingCount !== undefined
                ? (fa
                    ? `${continuation.remainingCount} مورد باقی‌مانده`
                    : `${continuation.remainingCount} remaining`)
                : (fa ? "صفحه بعد" : "Next bounded page")}
            </span>
          </button>
        ))}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
