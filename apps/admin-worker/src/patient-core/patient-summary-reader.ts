import type { PatientLongitudinalSummary } from "@glymize/contracts";
import { decryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { patientDemographicsAad } from "./aad";

type PatientRow = {
  id: string;
  status: "active" | "archived";
};

type IdentifierRow = {
  id: string;
  identifier_kind: "file_number" | "national_id" | "other";
  display_mask: string;
  is_primary: number;
};

type DemographicsRow = {
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
};

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export async function readPatientCoreSummary(
  context: PatientRecordV2RouteContext,
  patientId: string,
): Promise<PatientLongitudinalSummary | null> {
  const patient = await context.database.prepare(
    `SELECT id,status
     FROM patient_registry
     WHERE practice_id=? AND id=?`,
  ).bind(context.user.practiceId, patientId).first<PatientRow>();
  if (!patient) return null;

  const [identifiers, demographicsRow, latestEncounter] = await Promise.all([
    context.database.prepare(
      `SELECT id,identifier_kind,display_mask,is_primary
       FROM patient_identifiers
       WHERE practice_id=? AND patient_id=?
       ORDER BY is_primary DESC,created_at ASC`,
    ).bind(context.user.practiceId, patientId).all<IdentifierRow>(),
    context.database.prepare(
      `SELECT payload_ciphertext,payload_iv,payload_auth_tag
       FROM patient_demographics
       WHERE practice_id=? AND patient_id=?`,
    ).bind(context.user.practiceId, patientId).first<DemographicsRow>(),
    context.database.prepare(
      `SELECT encounter_at
       FROM patient_encounters
       WHERE practice_id=? AND patient_id=?
       ORDER BY encounter_at DESC,created_at DESC
       LIMIT 1`,
    ).bind(context.user.practiceId, patientId).first<{ encounter_at: string }>(),
  ]);

  let demographics: PatientLongitudinalSummary["demographics"] | undefined;
  if (demographicsRow) {
    const payload = await decryptClinicalPayload<Record<string, unknown>>(
      {
        ciphertext: demographicsRow.payload_ciphertext,
        iv: demographicsRow.payload_iv,
        authTag: demographicsRow.payload_auth_tag,
      },
      context.clinicalSecret,
      patientDemographicsAad(context.user.practiceId, patientId),
    );
    if (!payload) throw new Error("PATIENT_DEMOGRAPHICS_DECRYPTION_FAILED");

    const firstName = optionalText(payload.firstName);
    const lastName = optionalText(payload.lastName);
    const dateOfBirth = optionalText(payload.dateOfBirth);
    if (firstName || lastName || dateOfBirth) {
      demographics = {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
      };
    }
  }

  return {
    patientId: patient.id,
    status: patient.status,
    ...(demographics ? { demographics } : {}),
    identifiers: identifiers.results.map((row) => ({
      id: row.id,
      kind: row.identifier_kind,
      displayMask: row.display_mask,
      isPrimary: row.is_primary === 1,
    })),
    ...(latestEncounter ? { latestEncounterAt: latestEncounter.encounter_at } : {}),
  };
}
