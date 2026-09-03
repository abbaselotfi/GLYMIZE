import type { Metadata } from "next";

import PatientShell from "../components/patient-shell";

export const metadata: Metadata = {
  title: "Patient Portal | GLYMIZE",
  description: "The standalone GLYMIZE patient area.",
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PatientShell>{children}</PatientShell>;
}
