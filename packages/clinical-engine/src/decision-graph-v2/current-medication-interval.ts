import type { CurrentMedicationInput } from "@glymize/contracts";
import type { CurrentMedicationV2, StrengthComponentV2 } from "./types.js";

export type IntervalAwareCurrentMedicationInputV2 = CurrentMedicationInput & {
  /** Number of administrations in the explicit interval. Must be paired with administrationPeriodDays. */
  administrationsPerPeriod?: number;
  /** Length of the explicit administration interval in days. Must be paired with administrationsPerPeriod. */
  administrationPeriodDays?: number;
};

export interface CurrentMedicationAdministrationIntervalV2 {
  perAdministrationDose: StrengthComponentV2[];
  administrationsPerPeriod: number;
  periodDays: number;
  scheduleText: string;
  source: "explicit_interval" | "legacy_daily";
}

/** Runtime extension carried structurally through PatientContextV2 without changing
 * the shared v2 domain interface. Consumers that need interval semantics must use
 * this explicit type/helper rather than deriving a fake daily dose. */
export type IntervalAwareCurrentMedicationV2 = CurrentMedicationV2 & {
  administrationInterval?: CurrentMedicationAdministrationIntervalV2;
  intervalIssue?: string;
  brandName?: string;
  durationDays?: number;
};

export interface CurrentMedicationAdministrationResolutionV2 {
  dailyDose?: StrengthComponentV2[];
  administrationsPerDay?: number;
  administrationInterval?: CurrentMedicationAdministrationIntervalV2;
  intervalIssue?: string;
}

function positiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function doseComponent(ingredientKey: string, amount: number, unit: string): StrengthComponentV2[] {
  return [{ ingredientKey, amount, unit }];
}

function intervalText(administrationsPerPeriod: number, periodDays: number) {
  if (administrationsPerPeriod === 1 && periodDays === 7) return "once weekly";
  if (administrationsPerPeriod === 1 && periodDays === 14) return "once every 14 days";
  if (administrationsPerPeriod === 1 && periodDays === 28) return "once every 28 days";
  if (periodDays === 1) return `${administrationsPerPeriod} administration(s) per day`;
  return `${administrationsPerPeriod} administration(s) every ${periodDays} days`;
}

/**
 * Resolves current-medication timing without normalizing interval therapies into
 * a fictitious daily dose. Explicit interval fields take precedence. If either
 * explicit interval field is present, the pair must be complete and valid; an
 * invalid explicit interval never falls back to legacy daily fields.
 */
export function resolveCurrentMedicationAdministrationV2(
  input: IntervalAwareCurrentMedicationInputV2,
  ingredientKey: string,
  normalizedUnit?: string,
): CurrentMedicationAdministrationResolutionV2 {
  const explicitIntervalRequested =
    input.administrationsPerPeriod !== undefined || input.administrationPeriodDays !== undefined;

  if (explicitIntervalRequested) {
    if (!positiveFinite(input.administrationsPerPeriod) || !positiveFinite(input.administrationPeriodDays)) {
      return { intervalIssue: "Explicit medication interval requires positive administrationsPerPeriod and administrationPeriodDays." };
    }
    if (!positiveFinite(input.doseAmount) || !normalizedUnit) {
      return { intervalIssue: "Explicit medication interval requires a positive per-administration doseAmount and doseUnit." };
    }

    const perAdministrationDose = doseComponent(ingredientKey, input.doseAmount, normalizedUnit);
    const administrationInterval: CurrentMedicationAdministrationIntervalV2 = {
      perAdministrationDose,
      administrationsPerPeriod: input.administrationsPerPeriod,
      periodDays: input.administrationPeriodDays,
      scheduleText: intervalText(input.administrationsPerPeriod, input.administrationPeriodDays),
      source: "explicit_interval",
    };

    // A one-day explicit interval is genuinely daily and can safely populate the
    // legacy daily fields. Longer intervals deliberately do not.
    if (input.administrationPeriodDays === 1) {
      return {
        administrationInterval,
        administrationsPerDay: input.administrationsPerPeriod,
        dailyDose: doseComponent(
          ingredientKey,
          input.doseAmount * input.administrationsPerPeriod,
          normalizedUnit,
        ),
      };
    }

    return { administrationInterval };
  }

  const frequencyPerDay = positiveFinite(input.frequencyPerDay) ? input.frequencyPerDay : undefined;
  const explicitTotalDailyDose = positiveFinite(input.totalDailyDose) ? input.totalDailyDose : undefined;
  const calculatedTotalDailyDose =
    positiveFinite(input.doseAmount) && frequencyPerDay !== undefined
      ? input.doseAmount * frequencyPerDay
      : undefined;
  const totalDailyDose = explicitTotalDailyDose ?? calculatedTotalDailyDose;
  const result: CurrentMedicationAdministrationResolutionV2 = {
    administrationsPerDay: frequencyPerDay,
    dailyDose: totalDailyDose !== undefined && normalizedUnit
      ? doseComponent(ingredientKey, totalDailyDose, normalizedUnit)
      : undefined,
  };

  if (frequencyPerDay !== undefined && normalizedUnit) {
    const perAdministrationAmount = positiveFinite(input.doseAmount)
      ? input.doseAmount
      : totalDailyDose !== undefined
        ? totalDailyDose / frequencyPerDay
        : undefined;
    if (perAdministrationAmount !== undefined && Number.isFinite(perAdministrationAmount) && perAdministrationAmount > 0) {
      result.administrationInterval = {
        perAdministrationDose: doseComponent(ingredientKey, perAdministrationAmount, normalizedUnit),
        administrationsPerPeriod: frequencyPerDay,
        periodDays: 1,
        scheduleText: intervalText(frequencyPerDay, 1),
        source: "legacy_daily",
      };
    }
  }

  return result;
}

export function currentMedicationAdministrationIntervalV2(
  medication: CurrentMedicationV2,
): CurrentMedicationAdministrationIntervalV2 | undefined {
  return (medication as IntervalAwareCurrentMedicationV2).administrationInterval;
}

export function currentMedicationIntervalIssueV2(medication: CurrentMedicationV2): string | undefined {
  return (medication as IntervalAwareCurrentMedicationV2).intervalIssue;
}
