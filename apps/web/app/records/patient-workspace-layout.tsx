"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  getRuntimeProfile,
  type LayoutPreset,
} from "../../lib/runtime-client";
import styles from "./patient-workspace-layout.module.css";

type Props = {
  children: ReactNode;
};

export function PatientWorkspaceLayout({ children }: Props) {
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>("auto");

  useEffect(() => {
    let active = true;

    void getRuntimeProfile()
      .then((profile) => {
        if (active) setLayoutPreset(profile.layoutPreset);
      })
      .catch(() => {
        // Layout preference is presentation-only. If profile retrieval fails,
        // preserve the existing responsive Auto presentation and never block
        // access to the authoritative Patient Workspace data.
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      className={styles.shell}
      data-patient-workspace-layout={layoutPreset}
    >
      {children}
    </div>
  );
}
