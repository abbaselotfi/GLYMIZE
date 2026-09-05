"use client";

import { useMemo, useState } from "react";
import type { PatientTrendSeries } from "@glymize/contracts";
import styles from "./patient-trend-panel.module.css";

const WIDTH = 320;
const HEIGHT = 112;
const PAD_X = 14;
const PAD_Y = 12;

function seriesKey(series: PatientTrendSeries) {
  return `${series.canonicalKey}\u0000${series.unit}\u0000${series.specimen ?? ""}`;
}

function formatDate(value: string, fa: boolean) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(fa ? "fa-IR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function chartGeometry(series: PatientTrendSeries) {
  const points = series.points.filter(
    (point) => point.verification === "confirmed",
  );
  if (!series.chartEligible || points.length < 2) {
    return null;
  }

  const values = points.map((point) => point.value);
  const times = points.map((point) => Date.parse(point.observedAt));
  if (times.some(Number.isNaN)) return null;

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const valueRange = maxValue - minValue;
  const timeRange = maxTime - minTime;

  const coordinates = points.map((point, index) => {
    const time = times[index]!;
    const x = timeRange === 0
      ? PAD_X + (index / (points.length - 1)) * (WIDTH - PAD_X * 2)
      : PAD_X + ((time - minTime) / timeRange) * (WIDTH - PAD_X * 2);
    const y = valueRange === 0
      ? HEIGHT / 2
      : HEIGHT - PAD_Y -
        ((point.value - minValue) / valueRange) * (HEIGHT - PAD_Y * 2);
    return { point, x, y };
  });

  return {
    coordinates,
    polyline: coordinates.map(({ x, y }) => `${x},${y}`).join(" "),
  };
}

export function PatientTrendPanel({
  trends,
  locale,
  onOpenEncounter,
}: {
  trends: PatientTrendSeries[];
  locale: "fa" | "en";
  onOpenEncounter: (encounterId: string) => Promise<void> | void;
}) {
  const fa = locale === "fa";
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openingEncounterId, setOpeningEncounterId] = useState<string | null>(null);

  const visible = useMemo(
    () => trends.filter((series) => series.points.length > 0),
    [trends],
  );

  if (visible.length === 0) return null;

  async function openEncounter(encounterId: string) {
    setOpeningEncounterId(encounterId);
    try {
      await onOpenEncounter(encounterId);
    } finally {
      setOpeningEncounterId(null);
    }
  }

  return (
    <section className={styles.panel} data-patient-workspace="longitudinal-trends">
      <header className={styles.header}>
        <div>
          <span>LONGITUDINAL TRENDS</span>
          <h3>{fa ? "روند آزمایش‌ها" : "Lab trends"}</h3>
        </div>
        <small>
          {fa
            ? "خط روند فقط از نتایج تأییدشده با واحد و نمونه سازگار ساخته می‌شود."
            : "Trend lines use only confirmed results with compatible units and specimens."}
        </small>
      </header>

      <div className={styles.grid}>
        {visible.map((series) => {
          const key = seriesKey(series);
          const geometry = chartGeometry(series);
          const isExpanded = expanded === key;
          const confirmedPoints = series.points.filter(
            (point) => point.verification === "confirmed",
          );
          const latestConfirmed = confirmedPoints[confirmedPoints.length - 1];
          const unverifiedCount = series.points.filter(
            (point) => point.verification === "unverified",
          ).length;

          return (
            <article className={styles.card} key={key} data-chart-eligible={series.chartEligible}>
              <div className={styles.cardTop}>
                <div>
                  <strong>{series.displayName}</strong>
                  <small>
                    {[series.specimen, series.unit].filter(Boolean).join(" · ") ||
                      (fa ? "واحد ثبت نشده" : "Unit not recorded")}
                  </small>
                </div>
                {latestConfirmed && (
                  <div className={styles.latest}>
                    <b>{latestConfirmed.value}</b>
                    <span>{latestConfirmed.unit}</span>
                  </div>
                )}
              </div>

              {geometry ? (
                <svg
                  className={styles.chart}
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  role="img"
                  aria-label={fa ? `نمودار روند ${series.displayName}` : `${series.displayName} trend chart`}
                >
                  <polyline className={styles.line} points={geometry.polyline} />
                  {geometry.coordinates.map(({ point, x, y }) => (
                    <circle
                      className={styles.point}
                      key={point.observationId}
                      cx={x}
                      cy={y}
                      r="4"
                    >
                      <title>{`${formatDate(point.observedAt, fa)}: ${point.value} ${point.unit}`}</title>
                    </circle>
                  ))}
                </svg>
              ) : (
                <div className={styles.notChartable}>
                  {fa
                    ? "برای رسم خط روند، حداقل دو نتیجه تأییدشده و قابل‌مقایسه لازم است."
                    : "At least two confirmed, comparable measurements are required for a trend line."}
                </div>
              )}

              <div className={styles.meta}>
                <span>
                  {series.points.length} {fa ? "اندازه‌گیری" : "measurements"}
                </span>
                {unverifiedCount > 0 && (
                  <span className={styles.unverified}>
                    {unverifiedCount} {fa ? "تأییدنشده" : "unverified"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : key)}
                  aria-expanded={isExpanded}
                >
                  {isExpanded
                    ? (fa ? "بستن جزئیات" : "Close details")
                    : (fa ? "جزئیات" : "Details")}
                </button>
              </div>

              {isExpanded && (
                <div className={styles.details}>
                  {series.points.map((point) => (
                    <div className={styles.measurement} key={point.observationId}>
                      <div>
                        <strong>{point.value} {point.unit}</strong>
                        <span>{formatDate(point.observedAt, fa)}</span>
                        <small>
                          {point.verification === "confirmed"
                            ? (fa ? "تأییدشده" : "Confirmed")
                            : (fa ? "تأییدنشده — در خط روند استفاده نشده" : "Unverified — not used in the trend line")}
                          {point.abnormalFlag ? ` · ${point.abnormalFlag}` : ""}
                        </small>
                      </div>
                      <button
                        type="button"
                        disabled={openingEncounterId === point.encounterId}
                        onClick={() => void openEncounter(point.encounterId)}
                      >
                        {openingEncounterId === point.encounterId
                          ? "…"
                          : (fa ? "باز کردن ویزیت منبع" : "Open source encounter")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
