import type { CurrentMedicationInput } from "@glymize/contracts";
import { type2NumberOrUndefined } from "./type2-core-intake-ui";

export interface Type2MedicationRow {
  id: string;
  genericMedicationId?: string;
  genericName: string;
  doseAmount: string;
  doseUnit: string;
  frequencyPerDay: string;
  status: "active" | "held" | "stopped";
}

export function newType2MedicationRow(): Type2MedicationRow {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    genericName: "",
    doseAmount: "",
    doseUnit: "mg",
    frequencyPerDay: "",
    status: "active",
  };
}

export function type2CurrentMedicationPayload(rows: readonly Type2MedicationRow[]): CurrentMedicationInput[] {
  return rows
    .filter((item) => item.genericName.trim())
    .map((item) => {
      const doseAmount = type2NumberOrUndefined(item.doseAmount);
      const frequencyPerDay = type2NumberOrUndefined(item.frequencyPerDay);
      const hasDailyDose = doseAmount !== undefined && frequencyPerDay !== undefined;

      return {
        genericMedicationId: item.genericMedicationId,
        genericName: item.genericName.trim(),
        doseAmount,
        doseUnit: doseAmount !== undefined ? item.doseUnit : undefined,
        frequencyPerDay,
        totalDailyDose: hasDailyDose ? doseAmount * frequencyPerDay : undefined,
        totalDailyDoseUnit: hasDailyDose ? item.doseUnit : undefined,
        status: item.status,
        adherence: "unknown",
        tolerance: "unknown",
      };
    });
}
