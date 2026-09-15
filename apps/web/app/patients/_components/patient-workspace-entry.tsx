"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parsePatientWorkspaceQuery } from "../../../lib/patient-workspace-url";
import PatientClinicalWorkspace from "./patient-clinical-workspace";
import styles from "./patient-clinical-workspace.module.css";

export default function PatientWorkspaceEntry() {
  const searchParams = useSearchParams();
  // Read the original spelling too: serialization masks malformed percent escapes.
  const query = typeof window === "undefined" ? searchParams.toString() : window.location.search;
  const patientId = parsePatientWorkspaceQuery(query);
  if (patientId === null) {
    return (
      <main className={styles.statePage}>
        <div className={styles.stateCard} role="alert">
          <strong>شناسه بیمار معتبر نیست · Invalid patient identifier</strong>
          <Link href="/records">بازگشت به بیماران</Link>
        </div>
      </main>
    );
  }
  return <PatientClinicalWorkspace key={patientId} patientId={patientId} />;
}
