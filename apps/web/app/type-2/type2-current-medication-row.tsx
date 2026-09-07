"use client";

import type {
  Type2MedicationRow,
  Type2MedicationTherapyPhase,
} from "./type2-current-medication-ui";
import styles from "./type2-current-medication-row.module.css";

const UNITS = ["mg", "g", "mcg", "unit", "mL", "tablet", "capsule", "actuation", "vial", "ampoule", "pen"] as const;

interface Props {
  item: Type2MedicationRow;
  index: number;
  locale: "fa" | "en";
  onChange: (patch: Partial<Type2MedicationRow>) => void;
  onNameChange: (value: string) => void;
  onRemove: () => void;
}

export default function Type2CurrentMedicationRow({ item, index, locale, onChange, onNameChange, onRemove }: Props) {
  const fa = locale === "fa";
  const phase = item.therapyPhase ?? "";

  return <div className={styles.card}>
    <div className={styles.primaryRow}>
      <div className={styles.medIndex}>{index + 1}</div>
      <label><span>{fa ? "دارو" : "Medicine"}</span><input list="type2-drugs" value={item.genericName} onChange={(event) => onNameChange(event.target.value)} placeholder="Metformin" /></label>
      <label><span>{fa ? "برند، در صورت ثبت" : "Brand, if documented"}</span><input value={item.brandName ?? ""} onChange={(event) => onChange({ brandName: event.target.value })} placeholder="Wegovy" /></label>
      <label><span>{fa ? "دوز هر نوبت" : "Dose per administration"}</span><input type="number" min="0" step="0.1" value={item.doseAmount} onChange={(event) => onChange({ doseAmount: event.target.value })} /></label>
      <label><span>{fa ? "واحد" : "Unit"}</span><select value={item.doseUnit} onChange={(event) => onChange({ doseUnit: event.target.value })}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
      <label><span>{fa ? "دفعات/روز برای درمان روزانه" : "Times/day for daily therapy"}</span><input type="number" min="0" max="12" step="0.5" value={item.frequencyPerDay} onChange={(event) => onChange({ frequencyPerDay: event.target.value })} /></label>
      <button className={styles.remove} type="button" aria-label={fa ? "حذف دارو" : "Remove medicine"} onClick={onRemove}>×</button>
    </div>

    <details className={styles.reconciliation}>
      <summary>{fa ? "تطبیق فاصله مصرف و مرحله درمان" : "Interval and treatment-stage reconciliation"}</summary>
      <p>{fa
        ? "فقط اطلاعاتی را وارد کنید که صریحاً در پرونده یا شرح‌حال ثبت شده‌اند. مرحله درمان از نام دارو یا دوز حدس زده نمی‌شود. برای درمان‌های فاصله‌ای، تعداد مصرف در بازه و طول بازه را جداگانه ثبت کنید."
        : "Enter only explicitly documented facts. Treatment phase is never inferred from medicine name or dose. For interval therapies, record administrations per period and the period length separately."}</p>
      <div className={styles.detailGrid}>
        <label><span>{fa ? "تعداد مصرف در بازه" : "Administrations per period"}</span><input type="number" min="0" step="any" value={item.administrationsPerPeriod ?? ""} onChange={(event) => onChange({ administrationsPerPeriod: event.target.value })} placeholder="1" /></label>
        <label><span>{fa ? "طول بازه (روز)" : "Period length (days)"}</span><input type="number" min="0" step="any" value={item.administrationPeriodDays ?? ""} onChange={(event) => onChange({ administrationPeriodDays: event.target.value })} placeholder="7" /></label>
        <label><span>{fa ? "روزهای سپری‌شده روی دوز فعلی" : "Days on current dose"}</span><input type="number" min="0" step="1" value={item.daysOnCurrentDose ?? ""} onChange={(event) => onChange({ daysOnCurrentDose: event.target.value })} placeholder="28" /></label>
        <label><span>{fa ? "مرحله درمانِ ثبت‌شده" : "Documented treatment phase"}</span><select value={phase} onChange={(event) => onChange({ therapyPhase: event.target.value as Type2MedicationTherapyPhase })}><option value="">{fa ? "نامشخص / ثبت نشده" : "Unknown / not documented"}</option><option value="initiation">{fa ? "شروع" : "Initiation"}</option><option value="escalation">{fa ? "افزایش مرحله‌ای" : "Escalation"}</option><option value="maintenance">{fa ? "نگهدارنده" : "Maintenance"}</option></select></label>
        <label><span>{fa ? "روز تا نوبت بعدی" : "Days until next administration"}</span><input type="number" min="0" step="1" value={item.nextAdministrationInDays ?? ""} onChange={(event) => onChange({ nextAdministrationInDays: event.target.value })} placeholder="3" /></label>
        <label><span>{fa ? "مدت کل مصرف دارو (روز)" : "Total medication duration (days)"}</span><input type="number" min="0" step="1" value={item.durationDays ?? ""} onChange={(event) => onChange({ durationDays: event.target.value })} /></label>
      </div>
      <small>{fa
        ? "اگر فقط بخشی از interval ثبت شده باشد، GLYMIZE آن را کامل نمی‌کند؛ Decision Graph داده ناقص را به‌صورت fail-closed بررسی می‌کند."
        : "If only part of an interval is documented, GLYMIZE does not complete it; the Decision Graph evaluates the partial data fail-closed."}</small>
    </details>
  </div>;
}
