import { decryptClinicalPayload, type EncryptedClinicalPayload } from "../runtime-security";
import type { PatientRecordV2ReadContext } from "../patient-record-v2/context";

/** Preserve legacy behavior unless the authorized route supplied a request-owned decryptor. */
export function decryptPatientCorePayload<T>(
  context: PatientRecordV2ReadContext,
  payload: EncryptedClinicalPayload,
  aad: string,
): Promise<T | null> {
  return context.decryptClinical
    ? context.decryptClinical<T>(payload, aad)
    : decryptClinicalPayload<T>(payload, context.clinicalSecret, aad);
}
