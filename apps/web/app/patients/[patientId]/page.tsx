import PatientClinicalWorkspace from "./patient-clinical-workspace";

export default async function PatientWorkspacePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <PatientClinicalWorkspace patientId={patientId} />;
}
