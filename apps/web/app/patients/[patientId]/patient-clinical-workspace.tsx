"use client";

import type { PatientLongitudinalReadModel } from "@glymize/contracts/patient-core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPatientLongitudinalReadModel } from "../../../lib/patient-clinical-core-client";
import {
  createLatestPatientLongitudinalReader,
  isPatientWorkspaceReadScopeActive,
} from "../../../lib/patient-longitudinal-read-guard";
import {
  getCachedRuntimeUser,
  runtimeAuthEventName,
} from "../../../lib/runtime-client";
import { useGlymizeLocale } from "../../components/use-glymize-locale";
import styles from "./patient-clinical-workspace.module.css";
import { PatientClinicalWorkspaceView } from "./patient-clinical-workspace-view";

export default function PatientClinicalWorkspace({ patientId }: { patientId: string }) {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";
  const [model, setModel] = useState<PatientLongitudinalReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reader = useMemo(
    () => createLatestPatientLongitudinalReader((scope, signal) =>
      getPatientLongitudinalReadModel(scope.patientId, {
        expectedPracticeId: scope.practiceId,
        signal,
      })),
    [],
  );

  const load = useCallback(async () => {
    const user = getCachedRuntimeUser();
    if (!user || user.status !== "active") {
      reader.invalidate();
      setModel(null);
      setLoading(false);
      setError("AUTH_REQUIRED");
      return;
    }

    const requestScope = {
      actorId: user.id,
      practiceId: user.practiceId,
      patientId,
    };
    setLoading(true);
    setModel(null);
    setError("");
    try {
      const result = await reader.read(requestScope);
      if (result.status === "obsolete") return;

      const currentUser = getCachedRuntimeUser();
      if (!isPatientWorkspaceReadScopeActive(result.scope, currentUser)) {
        reader.invalidate();
        setModel(null);
        setError("PATIENT_CONTEXT_CHANGED");
        setLoading(false);
        return;
      }

      setModel(result.model);
      setLoading(false);
    } catch (cause) {
      setModel(null);
      setError(cause instanceof Error ? cause.message : "PATIENT_LONGITUDINAL_READ_FAILED");
      setLoading(false);
    }
  }, [patientId, reader]);

  useEffect(() => {
    void load();
    const onAuthChange = () => {
      reader.invalidate();
      setModel(null);
      if (getCachedRuntimeUser()?.status === "active") {
        void load();
      } else {
        setLoading(false);
        setError("AUTH_REQUIRED");
      }
    };
    window.addEventListener(runtimeAuthEventName(), onAuthChange);
    return () => {
      window.removeEventListener(runtimeAuthEventName(), onAuthChange);
      reader.invalidate();
    };
  }, [load, reader]);

  if (loading) {
    return (
      <main className={styles.statePage} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
        <div className={styles.stateCard}>
          <span>GLYMIZE · PATIENT</span>
          <strong>{fa ? "در حال ساخت نمای طولی بیمار…" : "Building longitudinal patient view…"}</strong>
        </div>
      </main>
    );
  }

  if (!model) {
    return (
      <main className={styles.statePage} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
        <div className={styles.stateCard}>
          <span>PATIENT WORKSPACE</span>
          <strong>{fa ? "پرونده قابل نمایش نیست" : "Patient workspace is unavailable"}</strong>
          <small>{error}</small>
          <div className={styles.stateActions}>
            <button type="button" onClick={() => void load()}>{fa ? "تلاش دوباره" : "Retry"}</button>
            <Link href="/records">{fa ? "بازگشت به بیماران" : "Back to patients"}</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <PatientClinicalWorkspaceView
      model={model}
      patientId={patientId}
      locale={locale}
      onRefresh={() => void load()}
    />
  );
}
