import type { PatientHandoffRecord } from "@glymize/contracts";
import styles from "./records.module.css";

type PatientMedicationReconciliationProps = {
  medications: PatientHandoffRecord["medications"];
  locale: "fa" | "en";
};

export function PatientMedicationReconciliation({
  medications,
  locale,
}: PatientMedicationReconciliationProps) {
  const fa = locale === "fa";

  return (
    <section
      className={styles.detailSection}
      data-workspace-medication-reconciliation="encounter-snapshot"
    >
      <h3>
        {fa
          ? "تطبیق داروهای پیش از ویزیت"
          : "Pre-visit medication reconciliation"}
      </h3>
      <p>
        {fa
          ? "این فهرست، داروهای ثبت‌شده در اسنپ‌شات همین ویزیت پیش از دستورات نهایی پزشک است؛ نسخه یا دستور دارویی امضاشده محسوب نمی‌شود."
          : "This list comes from this encounter snapshot before the physician's final post-visit orders. It is medication reconciliation, not a signed prescription or order."}
      </p>

      {medications.length === 0 ? (
        <p data-medication-reconciliation-empty="true">
          {fa
            ? "برای این ویزیت دارویی در بخش تطبیق دارویی ثبت نشده است."
            : "No medication reconciliation entries were recorded for this visit."}
        </p>
      ) : (
        <div className={styles.detailList}>
          {medications.map((medication, index) => (
            <div key={`${medication.genericName}-${index}`}>
              <strong>{medication.genericName}</strong>
              <span>
                {medication.doseAmount ?? "—"}{" "}
                {medication.doseUnit ?? ""}
              </span>
              <small>
                {fa ? "وضعیت تأیید: " : "Verification: "}
                {medication.verification}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
