import type {
  PatientCoreFactMeta,
  PatientCoreSourceReference,
} from "@glymize/contracts/patient-core";
import styles from "./patient-source-details.module.css";

function label(value: string | undefined) {
  return value && value.trim() ? value : "—";
}

export function PatientSourceDetails({
  source,
  meta,
  revision,
  locale,
}: {
  source?: PatientCoreSourceReference;
  meta?: PatientCoreFactMeta;
  revision?: number;
  locale: "fa" | "en";
}) {
  const fa = locale === "fa";
  const resolvedSource = meta?.source ?? source;
  const resolvedRevision = meta?.revision ?? revision;

  if (!resolvedSource && resolvedRevision === undefined && !meta) return null;

  return (
    <details className={styles.details} data-patient-workspace="source-audit">
      <summary>{fa ? "منبع / ممیزی" : "Source / audit"}</summary>
      <dl>
        {resolvedSource && (
          <>
            <div><dt>{fa ? "نوع منبع" : "Source"}</dt><dd>{resolvedSource.sourceType}</dd></div>
            <div><dt>{fa ? "نوع رکورد" : "Record type"}</dt><dd>{resolvedSource.recordType}</dd></div>
            <div><dt>{fa ? "شناسه رکورد" : "Record ID"}</dt><dd>{resolvedSource.recordId}</dd></div>
            {resolvedSource.encounterId && <div><dt>{fa ? "ویزیت" : "Encounter"}</dt><dd>{resolvedSource.encounterId}</dd></div>}
            {resolvedSource.documentId && <div><dt>{fa ? "سند" : "Document"}</dt><dd>{resolvedSource.documentId}</dd></div>}
          </>
        )}
        {resolvedRevision !== undefined && <div><dt>{fa ? "نسخه" : "Revision"}</dt><dd>{resolvedRevision}</dd></div>}
        {meta && (
          <>
            <div><dt>{fa ? "تأیید" : "Verification"}</dt><dd>{meta.verification}</dd></div>
            <div><dt>{fa ? "تازگی" : "Freshness"}</dt><dd>{meta.freshness}</dd></div>
            <div><dt>{fa ? "زمان مؤثر" : "Effective"}</dt><dd>{label(meta.effectiveAt)}</dd></div>
            <div><dt>{fa ? "زمان ثبت" : "Recorded"}</dt><dd>{label(meta.recordedAt)}</dd></div>
          </>
        )}
      </dl>
    </details>
  );
}
