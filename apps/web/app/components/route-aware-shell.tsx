"use client";

import { usePathname } from "next/navigation";

import AppShell from "./app-shell";

export default function RouteAwareShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isPatientAppPath =
    pathname === "/patient" || pathname.startsWith("/patient/");

  if (isPatientAppPath) return <>{children}</>;

  return <AppShell>{children}</AppShell>;
}
