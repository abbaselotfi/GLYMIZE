import type { Metadata } from "next";
import { Suspense } from "react";
import PatientWorkspaceEntry from "./_components/patient-workspace-entry";

export const metadata: Metadata = { referrer: "no-referrer", robots: "noindex, nofollow" };

export default function PatientWorkspacePage() {
  return (
    <Suspense fallback={<main aria-busy="true">در حال آماده‌سازی پرونده…</main>}>
      <PatientWorkspaceEntry />
    </Suspense>
  );
}
