"use client";

import type {
  PatientLongitudinalHistoryFamily,
  PatientLongitudinalHistoryPage,
  PatientLongitudinalReadModel,
} from "@glymize/contracts/patient-core";
import { validatePatientLongitudinalContinuations } from "./patient-longitudinal-continuation-validator";
import { parsePatientLongitudinalHistoryPage } from "./patient-longitudinal-history-validator";
import { parsePatientLongitudinalReadModel } from "./patient-longitudinal-response-validator";
import { runtimeFetch } from "./runtime-client";

async function responseErrorCode(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Keep the bounded fallback error code.
  }
  return fallback;
}

export async function getPatientLongitudinalReadModel(
  patientId: string,
  options: { expectedPracticeId: string; signal?: AbortSignal },
): Promise<PatientLongitudinalReadModel> {
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/longitudinal`,
    { signal: options.signal },
  );

  if (!response.ok) {
    throw new Error(await responseErrorCode(response, "PATIENT_LONGITUDINAL_READ_FAILED"));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("PATIENT_LONGITUDINAL_INVALID_RESPONSE");
  }

  const model = parsePatientLongitudinalReadModel(payload, {
    patientId,
    practiceId: options.expectedPracticeId,
  });
  return validatePatientLongitudinalContinuations(model);
}

export async function getPatientLongitudinalHistoryPage(
  patientId: string,
  options: {
    expectedPracticeId: string;
    family: PatientLongitudinalHistoryFamily;
    cursor: string;
    signal?: AbortSignal;
  },
): Promise<PatientLongitudinalHistoryPage> {
  const query = new URLSearchParams({
    family: options.family,
    cursor: options.cursor,
  });
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/longitudinal/history?${query.toString()}`,
    { signal: options.signal },
  );
  if (!response.ok) {
    throw new Error(await responseErrorCode(response, "PATIENT_LONGITUDINAL_HISTORY_READ_FAILED"));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("PATIENT_LONGITUDINAL_HISTORY_INVALID_RESPONSE");
  }

  return parsePatientLongitudinalHistoryPage(payload, {
    patientId,
    practiceId: options.expectedPracticeId,
    family: options.family,
  });
}
