import type { GenericMedication } from "@glymize/contracts";
import type { BuildType2DecisionGraphAssessmentInput } from "@glymize/clinical-engine";
import { type2NumberOrUndefined } from "./type2-core-intake-ui";

type Type2CurrentMedicationIntakeV2 = NonNullable<
  BuildType2DecisionGraphAssessmentInput["request"]["currentMedications"]
>[number];

export type Type2MedicationTherapyPhase = "" | "initiation" | "escalation" | "maintenance";

export interface Type2MedicationRow {
  id: string;
  genericMedicationId?: string;
  genericName: string;
  brandName?: string;
  doseAmount: string;
  doseUnit: string;
  frequencyPerDay: string;
  administrationsPerPeriod?: string;
  administrationPeriodDays?: string;
  daysOnCurrentDose?: string;
  therapyPhase?: Type2MedicationTherapyPhase;
  nextAdministrationInDays?: string;
  durationDays?: string;
  status: "active" | "held" | "stopped";
}

export function newType2MedicationRow(): Type2MedicationRow {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    genericName: "",
    brandName: "",
    doseAmount: "",
    doseUnit: "mg",
    frequencyPerDay: "",
    administrationsPerPeriod: "",
    administrationPeriodDays: "",
    daysOnCurrentDose: "",
    therapyPhase: "",
    nextAdministrationInDays: "",
    durationDays: "",
    status: "active",
  };
}

/**
 * Mechanical projection of clinician-entered current-medication facts.
 *
 * Safety invariants:
 * - interval/stage/timing is never inferred from medication name, brand, dose, or frequency;
 * - therapyGroup is copied only from an exact trusted catalogue id; free-text names never create treatment context;
 * - a partial explicit interval stays partial so the Decision Graph can fail closed;
 * - explicit interval semantics are carried separately from legacy daily frequency.
 */
export function type2CurrentMedicationPayload(
  rows: readonly Type2MedicationRow[],
  catalog: readonly GenericMedication[] = [],
): Type2CurrentMedicationIntakeV2[] {
  return rows
    .filter((item) => item.genericName.trim())
    .map((item) => {
      const doseAmount = type2NumberOrUndefined(item.doseAmount);
      const frequencyPerDay = type2NumberOrUndefined(item.frequencyPerDay);
      const hasDailyDose = doseAmount !== undefined && frequencyPerDay !== undefined;
      const trustedCatalogMedication = item.genericMedicationId
        ? catalog.find((candidate) => candidate.id === item.genericMedicationId)
        : undefined;

      return {
        genericMedicationId: item.genericMedicationId,
        therapyGroup: trustedCatalogMedication?.therapyGroup,
        genericName: item.genericName.trim(),
        brandName: item.brandName?.trim() || undefined,
        doseAmount,
        doseUnit: doseAmount !== undefined ? item.doseUnit : undefined,
        frequencyPerDay,
        totalDailyDose: hasDailyDose ? doseAmount * frequencyPerDay : undefined,
        totalDailyDoseUnit: hasDailyDose ? item.doseUnit : undefined,
        administrationsPerPeriod: type2NumberOrUndefined(item.administrationsPerPeriod ?? ""),
        administrationPeriodDays: type2NumberOrUndefined(item.administrationPeriodDays ?? ""),
        daysOnCurrentDose: type2NumberOrUndefined(item.daysOnCurrentDose ?? ""),
        therapyPhase: item.therapyPhase || undefined,
        nextAdministrationInDays: type2NumberOrUndefined(item.nextAdministrationInDays ?? ""),
        durationDays: type2NumberOrUndefined(item.durationDays ?? ""),
        status: item.status,
        adherence: "unknown",
        tolerance: "unknown",
      };
    });
}
