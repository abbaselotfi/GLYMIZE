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
