import type { PatientObservationView } from "@glymize/contracts/patient-core";

export type PatientObservationTrendDirection = "up" | "down" | "flat";

export interface PatientObservationTrendPoint {
  value: number;
  observedAt: string;
  abnormalFlag?: string;
}

export interface PatientObservationTrend {
  factKey: string;
  displayName: string;
  unit?: string;
  latest: number;
  previous: number;
  direction: PatientObservationTrendDirection;
  points: PatientObservationTrendPoint[];
}

function direction(latest: number, previous: number): PatientObservationTrendDirection {
  if (latest > previous) return "up";
  if (latest < previous) return "down";
  return "flat";
}

/**
 * Builds factual numeric series from the longitudinal Patient Core observation
 * projection. This helper performs no thresholding and no clinical
 * interpretation: up/down/flat is arithmetic direction only.
 */
export function buildPatientObservationTrends(
  observations: PatientObservationView[],
  limit = 4,
): PatientObservationTrend[] {
  const grouped = new Map<string, PatientObservationView[]>();

  for (const observation of observations) {
    if (typeof observation.value !== "number" || !Number.isFinite(observation.value)) {
      continue;
    }
    const group = grouped.get(observation.factKey) ?? [];
    group.push(observation);
    grouped.set(observation.factKey, group);
  }

  return [...grouped.entries()]
    .map(([factKey, items]) => {
      const ordered = [...items].sort((left, right) =>
        left.observedAt.localeCompare(right.observedAt),
      );
      if (ordered.length < 2) return null;

      const recent = ordered.slice(-6);
      const latestObservation = recent.at(-1)!;
      const previousObservation = recent.at(-2)!;
      const latest = latestObservation.value as number;
      const previous = previousObservation.value as number;

      return {
        factKey,
        displayName: latestObservation.displayName,
        ...(latestObservation.unit ? { unit: latestObservation.unit } : {}),
        latest,
        previous,
        direction: direction(latest, previous),
        points: recent.map((item) => ({
          value: item.value as number,
          observedAt: item.observedAt,
          ...(item.abnormalFlag ? { abnormalFlag: item.abnormalFlag } : {}),
        })),
        latestObservedAt: latestObservation.observedAt,
      };
    })
    .filter((item): item is PatientObservationTrend & { latestObservedAt: string } => item !== null)
    .sort((left, right) => right.latestObservedAt.localeCompare(left.latestObservedAt))
    .slice(0, Math.max(0, limit))
    .map(({ latestObservedAt: _latestObservedAt, ...trend }) => trend);
}
