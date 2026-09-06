import RecordsClient from "./records-client";
import { PatientWorkspaceLayout } from "./patient-workspace-layout";

export default function RecordsPage() {
  return (
    <PatientWorkspaceLayout>
      <RecordsClient />
    </PatientWorkspaceLayout>
  );
}
