"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { basePath } from "../../lib/base-path";
import { legacyPatientWorkspaceHref } from "../../lib/patient-workspace-url";

export default function LegacyPatientRouteBridge() {
  const pathname = usePathname();
  useEffect(() => {
    const target = legacyPatientWorkspaceHref(window.location.pathname, window.location.search, basePath);
    if (target) window.location.replace(target);
  }, [pathname]);
  return null;
}
