"use client";

import type { PatientLongitudinalReadModel } from "@glymize/contracts/patient-core";
import { runtimeFetch } from "./runtime-client";

export async function getPatientLongitudinalReadModel(
  patientId: string,
): Promise<PatientLongitudinalReadModel> {
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/longitudinal`,
  );

  if (!response.ok) {
    let code = "PATIENT_LONGITUDINAL_READ_FAILED";
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === "string" && body.error) code = body.error;
    } catch {
      // Keep the bounded fallback error code.
    }
    throw new Error(code);
  }

  return response.json() as Promise<PatientLongitudinalReadModel>;
}
