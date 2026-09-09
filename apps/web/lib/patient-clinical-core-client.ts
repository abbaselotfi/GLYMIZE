"use client";

import type { PatientLongitudinalReadModel } from "@glymize/contracts/patient-core";
import { parsePatientLongitudinalReadModel } from "./patient-longitudinal-response-validator";
import { runtimeFetch } from "./runtime-client";

export async function getPatientLongitudinalReadModel(
  patientId: string,
  options: { expectedPracticeId: string; signal?: AbortSignal },
): Promise<PatientLongitudinalReadModel> {
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/longitudinal`,
    { signal: options.signal },
  );

  if (!response.ok) {
    let code = "PATIENT_LONGITUDINAL_READ_FAILED";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) code = body.error;
    } catch {
      // Keep the bounded fallback error code.
    }
    throw new Error(code);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("PATIENT_LONGITUDINAL_INVALID_RESPONSE");
  }

  return parsePatientLongitudinalReadModel(payload, {
    patientId,
    practiceId: options.expectedPracticeId,
  });
}
