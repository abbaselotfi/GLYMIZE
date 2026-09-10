export function patientDemographicsAad(practiceId: string, patientId: string) {
  return `patient-demographics:${practiceId}:${patientId}`;
}

export function patientSnapshotAad(
  practiceId: string,
  encounterId: string,
  revision: number,
) {
  return `patient-snapshot:${practiceId}:${encounterId}:${revision}`;
}

export function patientObservationAad(practiceId: string, observationId: string) {
  return `patient-observation:${practiceId}:${observationId}`;
}

export function patientCoreAuthorityFactAad(
  family: "allergy" | "problem",
  practiceId: string,
  patientId: string,
  factId: string,
  revision: number,
) {
  return `patient-core-${family}:${practiceId}:${patientId}:${factId}:${revision}`;
}

export function patientCoreReconciliationAad(
  practiceId: string,
  patientId: string,
  family: "allergy" | "problem",
  revision: number,
) {
  return `patient-core-reconciliation:${practiceId}:${patientId}:${family}:${revision}`;
}
