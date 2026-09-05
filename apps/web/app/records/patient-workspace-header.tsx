"use client";

import type { PatientWorkspaceSnapshot } from "@glymize/contracts";
import styles from "./patient-workspace-header.module.css";

function identifierLabel(
  kind: PatientWorkspaceSnapshot["patient"]["identifiers"][number]["kind"],
  fa: boolean,
) {
  if (kind === "national_id") return fa ? "کد ملی" : "National ID";
  if (kind === "file_number") return fa ? "شماره پرونده" : "File number";
  return fa ? "شناسه دیگر" : "Other identifier";
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

export function PatientWorkspaceHeader({
  workspace,
  locale,
}: {
  workspace: PatientWorkspaceSnapshot;
  locale: "fa" | "en";
}) {
  const fa = locale === "fa";
  const patient = workspace.patient;
  const name = [
    patient.demographics?.firstName,
    patient.demographics?.lastName,
  ].filter(Boolean).join(" ");
  const latestEncounterAt =
    patient.latestEncounterAt ?? workspace.encounters[0]?.encounterAt;

  return (
    <section className={styles.header} data-patient-workspace="stable-header">
      <div className={styles.titleRow}>
        <div>
          <span>PATIENT WORKSPACE</span>
          <h2>{name || (fa ? "بیمار بدون نام ثبت‌شده" : "Patient name not recorded")}</h2>
          <small>
            {patient.status === "active"
              ? (fa ? "پرونده فعال" : "Active patient record")
              : (fa ? "پرونده بایگانی‌شده" : "Archived patient record")}
          </small>
        </div>
        <div className={styles.visitCount}>
          <b>{workspace.encounters.length}</b>
          <span>{fa ? "ویزیت" : "visits"}</span>
        </div>
      </div>

      <div className={styles.identifiers}>
        {patient.identifiers.map((identifier) => (
          <div className={styles.identifier} key={identifier.id}>
            <span>{identifierLabel(identifier.kind, fa)}</span>
            <strong>{identifier.displayMask}</strong>
            {identifier.isPrimary && (
              <small>{fa ? "شناسه اصلی" : "Primary"}</small>
            )}
          </div>
        ))}
      </div>

      <div className={styles.meta}>
        {patient.demographics?.dateOfBirth && (
          <div>
            <span>{fa ? "تاریخ تولد" : "Date of birth"}</span>
            <strong>{formatDate(patient.demographics.dateOfBirth, fa)}</strong>
          </div>
        )}
        {latestEncounterAt && (
          <div>
            <span>{fa ? "آخرین ویزیت" : "Latest visit"}</span>
            <strong>{formatDate(latestEncounterAt, fa)}</strong>
          </div>
        )}
      </div>
    </section>
  );
}
