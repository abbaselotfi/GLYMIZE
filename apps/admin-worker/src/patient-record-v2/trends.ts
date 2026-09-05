import type {
  PatientObservationVerification,
  PatientTrendSeries,
} from "@glymize/contracts";
import { decryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "./context";

type TrendObservationRow = {
  id: string;
  encounter_id: string;
  canonical_key: string;
  observed_at: string;
  verification: PatientObservationVerification;
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
};

export type DecryptedTrendObservation = {
  observationId: string;
  encounterId: string;
  canonicalKey: string;
  observedAt: string;
  verification: PatientObservationVerification;
  payload: Record<string, unknown>;
};

type NormalizedText = {
  key: string;
  display: string;
};

const UNIT_DISPLAY_ALIASES = new Map<string, string>([
  ["%", "%"],
  ["mg/dl", "mg/dL"],
  ["mg/l", "mg/L"],
  ["mg/g", "mg/g"],
  ["mg/mmol", "mg/mmol"],
  ["mg/24h", "mg/24h"],
  ["g/dl", "g/dL"],
  ["g/l", "g/L"],
  ["g/24h", "g/24h"],
  ["mmol/l", "mmol/L"],
  ["mmol/mol", "mmol/mol"],
  ["meq/l", "mEq/L"],
  ["umol/l", "umol/L"],
  ["nmol/l", "nmol/L"],
  ["pmol/l", "pmol/L"],
  ["ng/ml", "ng/mL"],
  ["pg/ml", "pg/mL"],
  ["ug/dl", "ug/dL"],
  ["ug/l", "ug/L"],
  ["uiu/ml", "uIU/mL"],
  ["miu/l", "mIU/L"],
  ["u/l", "U/L"],
  ["iu/l", "IU/L"],
  ["ml/min/1.73m2", "mL/min/1.73m2"],
  ["ml/min/1.73m²", "mL/min/1.73m2"],
  ["mosm/kg", "mOsm/kg"],
]);

function normalizedText(value: unknown): NormalizedText | null {
  const display = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (!display) return null;
  return {
    key: display.toLocaleLowerCase(),
    display,
  };
}

export function normalizeTrendUnit(value: unknown): NormalizedText | null {
  const raw = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[μµ]/g, "u")
    .replace(/\s+/g, "");
  if (!raw) return null;

  const key = raw.toLocaleLowerCase();
  return {
    key,
    display: UNIT_DISPLAY_ALIASES.get(key) ?? raw,
  };
}

function safeDisplayName(payload: Record<string, unknown>, canonicalKey: string) {
  const canonicalName = String(payload.canonicalName ?? "").trim();
  if (canonicalName) return canonicalName.slice(0, 160);
  const rawName = String(payload.rawName ?? "").trim();
  return rawName ? rawName.slice(0, 160) : canonicalKey;
}

function safeAbnormalFlag(payload: Record<string, unknown>) {
  const value = String(
    payload.interpretation ?? payload.abnormalFlag ?? "",
  ).trim();
  return value ? value.slice(0, 24) : undefined;
}

/**
 * Build presentation-ready longitudinal series without inventing clinical
 * equivalence. Unit normalization here only canonicalizes spelling/casing;
 * it never converts numeric values between different unit systems.
 */
export function buildPatientTrendSeries(
  observations: readonly DecryptedTrendObservation[],
): PatientTrendSeries[] {
  const groups = new Map<
    string,
    PatientTrendSeries & { confirmedPointCount: number }
  >();

  for (const observation of observations) {
    const canonicalKey = observation.canonicalKey.trim();
    if (!canonicalKey || canonicalKey.startsWith("raw:")) continue;
    if (observation.verification === "rejected") continue;

    const value = observation.payload.value;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;

    const unit = normalizeTrendUnit(observation.payload.unit);
    const specimen = normalizedText(observation.payload.specimen);
    const groupKey = [
      canonicalKey,
      unit?.key ?? "<unit-missing>",
      specimen?.key ?? "<specimen-missing>",
    ].join("\u0000");

    let series = groups.get(groupKey);
    if (!series) {
      series = {
        canonicalKey,
        displayName: safeDisplayName(observation.payload, canonicalKey),
        unit: unit?.display ?? "",
        ...(specimen ? { specimen: specimen.display } : {}),
        chartEligible: false,
        points: [],
        confirmedPointCount: 0,
      };
      groups.set(groupKey, series);
    }

    const abnormalFlag = safeAbnormalFlag(observation.payload);
    series.points.push({
      observationId: observation.observationId,
      encounterId: observation.encounterId,
      observedAt: observation.observedAt,
      value,
      unit: unit?.display ?? "",
      verification: observation.verification,
      ...(abnormalFlag ? { abnormalFlag } : {}),
    });
    if (observation.verification === "confirmed") {
      series.confirmedPointCount += 1;
    }
  }

  return [...groups.values()]
    .map(({ confirmedPointCount, ...series }) => ({
      ...series,
      // Missing units are kept visible as non-chartable observations. A line
      // is eligible only after two human-confirmed, unit-compatible results.
      chartEligible:
        Boolean(series.unit) && confirmedPointCount >= 2,
      points: [...series.points].sort((left, right) =>
        left.observedAt.localeCompare(right.observedAt),
      ),
    }))
    .sort((left, right) =>
      Number(right.chartEligible) - Number(left.chartEligible) ||
      left.displayName.localeCompare(right.displayName),
    );
}

/**
 * Read only observations belonging to the latest immutable snapshot revision
 * of each encounter. Superseded revision rows remain stored for audit/history
 * but must not appear twice in the current longitudinal trend projection.
 */
export async function readPatientTrendSeries(
  context: PatientRecordV2RouteContext,
  patientId: string,
): Promise<PatientTrendSeries[]> {
  const rows = await context.database.prepare(
    `SELECT o.id,o.encounter_id,o.canonical_key,o.observed_at,o.verification,
            o.payload_ciphertext,o.payload_iv,o.payload_auth_tag
     FROM patient_observations o
     WHERE o.practice_id=? AND o.patient_id=?
       AND o.canonical_key NOT LIKE 'raw:%'
       AND o.snapshot_revision=(
         SELECT MAX(s.revision)
         FROM patient_encounter_snapshots s
         WHERE s.practice_id=o.practice_id
           AND s.encounter_id=o.encounter_id
       )
     ORDER BY o.canonical_key ASC,o.observed_at ASC,o.created_at ASC`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).all<TrendObservationRow>();

  const observations: DecryptedTrendObservation[] = [];
  for (const row of rows.results) {
    const payload = await decryptClinicalPayload<Record<string, unknown>>(
      {
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        authTag: row.payload_auth_tag,
      },
      context.clinicalSecret,
      `patient-observation:${context.user.practiceId}:${row.id}`,
    );
    if (!payload) {
      throw new Error("PATIENT_OBSERVATION_DECRYPTION_FAILED");
    }

    observations.push({
      observationId: row.id,
      encounterId: row.encounter_id,
      canonicalKey: row.canonical_key,
      observedAt: row.observed_at,
      verification: row.verification,
      payload,
    });
  }

  return buildPatientTrendSeries(observations);
}
