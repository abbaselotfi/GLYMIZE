"use client";

import { useEffect, useMemo, useState } from "react";
import type { PatientEncounterSummary } from "@glymize/contracts";
import styles from "./patient-encounter-timeline.module.css";

function formatDate(value: string, fa: boolean) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(fa ? "fa-IR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: PatientEncounterSummary["status"], fa: boolean) {
  const labels = fa
    ? {
        draft: "پیش‌نویس",
        ready_for_physician: "آماده بررسی پزشک",
        reviewed: "بررسی‌شده",
        completed: "تکمیل‌شده",
        archived: "بایگانی‌شده",
      }
    : {
        draft: "Draft",
        ready_for_physician: "Ready for physician",
        reviewed: "Reviewed",
        completed: "Completed",
        archived: "Archived",
      };
  return labels[status];
}

function sourceLabel(source: PatientEncounterSummary["source"], fa: boolean) {
  const labels = fa
    ? {
        care_team: "تیم مراقبت",
        physician: "پزشک",
        import: "ورودی داده",
        other: "سایر",
      }
    : {
        care_team: "Care team",
        physician: "Physician",
        import: "Imported",
        other: "Other",
      };
  return labels[source];
}

function kindLabel(kind: PatientEncounterSummary["encounterKind"], fa: boolean) {
  const labels = fa
    ? {
        outpatient: "حضوری",
        telehealth: "از راه دور",
        other: "سایر",
      }
    : {
        outpatient: "Outpatient",
        telehealth: "Telehealth",
        other: "Other",
      };
  return labels[kind];
}

export function PatientEncounterTimeline({
  encounters,
  locale,
  onOpenEncounter,
}: {
  encounters: PatientEncounterSummary[];
  locale: "fa" | "en";
  onOpenEncounter: (encounterId: string) => Promise<void> | void;
}) {
  const fa = locale === "fa";
  const ordered = useMemo(
    () => [...encounters].sort((left, right) =>
      right.encounterAt.localeCompare(left.encounterAt),
    ),
    [encounters],
  );
  const newestId = ordered[0]?.encounterId ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(newestId);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    // A newly selected patient gets its newest encounter expanded by default.
    setExpandedId(newestId);
  }, [newestId]);

  if (ordered.length === 0) return null;

  async function openEncounter(encounterId: string) {
    setOpeningId(encounterId);
    try {
      await onOpenEncounter(encounterId);
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <section className={styles.timeline} data-patient-workspace="encounter-timeline">
      <header className={styles.header}>
        <div>
          <span>ENCOUNTER TIMELINE</span>
          <h3>{fa ? "تاریخچه ویزیت‌ها" : "Visit timeline"}</h3>
        </div>
        <small>
          {fa
            ? "جدیدترین ویزیت ابتدا باز است؛ ویزیت‌های قبلی بدون حذف یا بازنویسی در تاریخچه باقی می‌مانند."
            : "The newest visit opens first; prior visits remain available without being overwritten."}
        </small>
      </header>

      <div className={styles.list}>
        {ordered.map((encounter, index) => {
          const expanded = encounter.encounterId === expandedId;
          const newest = index === 0;
          return (
            <article
              className={styles.card}
              key={encounter.encounterId}
              data-newest={newest}
              data-expanded={expanded}
            >
              <button
                className={styles.summary}
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : encounter.encounterId)}
              >
                <div>
                  <strong>{formatDate(encounter.encounterAt, fa)}</strong>
                  <span>
                    {kindLabel(encounter.encounterKind, fa)} · {sourceLabel(encounter.source, fa)}
                  </span>
                </div>
                <div className={styles.summaryMeta}>
                  {newest && <small>{fa ? "جدیدترین" : "Newest"}</small>}
                  <b>{statusLabel(encounter.status, fa)}</b>
                  <i aria-hidden="true">{expanded ? "−" : "+"}</i>
                </div>
              </button>

              {expanded && (
                <div className={styles.details}>
                  <dl>
                    <div>
                      <dt>{fa ? "نسخه Snapshot" : "Snapshot revision"}</dt>
                      <dd>{encounter.latestSnapshotRevision ?? (fa ? "ثبت نشده" : "Not recorded")}</dd>
                    </div>
                    <div>
                      <dt>{fa ? "برنامه امضاشده" : "Signed plan"}</dt>
                      <dd>
                        {encounter.latestSignedPlanId
                          ? (fa ? "موجود" : "Available")
                          : (fa ? "موجود نیست" : "Not available")}
                      </dd>
                    </div>
                  </dl>
                  <button
                    className={styles.openButton}
                    type="button"
                    disabled={openingId === encounter.encounterId}
                    onClick={() => void openEncounter(encounter.encounterId)}
                  >
                    {openingId === encounter.encounterId
                      ? "…"
                      : (fa ? "باز کردن جزئیات این ویزیت" : "Open this visit")}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
