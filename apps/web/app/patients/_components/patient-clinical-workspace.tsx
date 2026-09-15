"use client";

import type {
  PatientLongitudinalHistoryFamily,
  PatientLongitudinalReadModel,
} from "@glymize/contracts/patient-core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPatientLongitudinalHistoryPage,
  getPatientLongitudinalReadModel,
} from "../../../lib/patient-clinical-core-client";
import { mergePatientLongitudinalHistoryPage } from "../../../lib/patient-longitudinal-history-merge";
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
import { PatientHistoryContinuation } from "./patient-history-continuation";

function continuationFor(
  model: PatientLongitudinalReadModel,
  family: PatientLongitudinalHistoryFamily,
) {
  return family === "observations"
    ? model.context.observations.continuation
    : model.timeline.continuation;
}

export default function PatientClinicalWorkspace({ patientId }: { patientId: string }) {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";
  const [model, setModel] = useState<PatientLongitudinalReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyLoadingFamily, setHistoryLoadingFamily] =
    useState<PatientLongitudinalHistoryFamily | null>(null);
  const [historyError, setHistoryError] = useState("");
  const historyRequest = useRef<AbortController | null>(null);
  const invalidateHistory = useCallback(() => {
    historyRequest.current?.abort();
    historyRequest.current = null;
  }, []);
  const reader = useMemo(
    () => createLatestPatientLongitudinalReader((scope, signal) =>
      getPatientLongitudinalReadModel(scope.patientId, {
        expectedPracticeId: scope.practiceId,
        signal,
      })),
    [],
  );

  const load = useCallback(async () => {
    invalidateHistory();
    const user = getCachedRuntimeUser();
    setHistoryLoadingFamily(null);
    setHistoryError("");
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
  }, [patientId, reader, invalidateHistory]);

  const loadHistory = useCallback(async (family: PatientLongitudinalHistoryFamily) => {
    const user = getCachedRuntimeUser();
    if (!model || !user || user.status !== "active") {
      setHistoryError("AUTH_REQUIRED");
      return;
    }
    const continuation = continuationFor(model, family);
    const cursor = continuation?.nextCursor;
    if (!continuation?.hasMore || !cursor) return;

    const requestScope = {
      actorId: user.id,
      practiceId: user.practiceId,
      patientId,
    };
    if (!isPatientWorkspaceReadScopeActive(requestScope, user)) {
      setModel(null);
      setHistoryError("PATIENT_CONTEXT_CHANGED");
      return;
    }

    invalidateHistory();
    const controller = new AbortController();
    historyRequest.current = controller;
    setHistoryLoadingFamily(family);
    setHistoryError("");
    try {
      const page = await getPatientLongitudinalHistoryPage(patientId, {
        expectedPracticeId: user.practiceId,
        family,
        cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const currentUser = getCachedRuntimeUser();
      if (!isPatientWorkspaceReadScopeActive(requestScope, currentUser)) {
        reader.invalidate();
        setModel(null);
        setHistoryError("PATIENT_CONTEXT_CHANGED");
        return;
      }

      setModel((current) => {
        if (controller.signal.aborted || !current) return current;
        const currentContinuation = continuationFor(current, family);
        if (currentContinuation?.nextCursor !== cursor) return current;
        return mergePatientLongitudinalHistoryPage(current, page);
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setHistoryError(
        cause instanceof Error
          ? cause.message
          : "PATIENT_LONGITUDINAL_HISTORY_READ_FAILED",
      );
    } finally {
      if (historyRequest.current === controller) {
        historyRequest.current = null;
        setHistoryLoadingFamily(null);
      }
    }
  }, [model, patientId, reader, invalidateHistory]);

  useEffect(() => {
    void load();
    const onAuthChange = () => {
      invalidateHistory();
      reader.invalidate();
      setModel(null);
      setHistoryLoadingFamily(null);
      setHistoryError("");
      if (getCachedRuntimeUser()?.status === "active") {
        void load();
      } else {
        setLoading(false);
        setError("AUTH_REQUIRED");
      }
    };
    window.addEventListener(runtimeAuthEventName(), onAuthChange);
    return () => {
      invalidateHistory();
      window.removeEventListener(runtimeAuthEventName(), onAuthChange);
      reader.invalidate();
    };
  }, [load, reader, invalidateHistory]);

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
          <small>{error || historyError}</small>
          <div className={styles.stateActions}>
            <button type="button" onClick={() => void load()}>{fa ? "تلاش دوباره" : "Retry"}</button>
            <Link href="/records">{fa ? "بازگشت به بیماران" : "Back to patients"}</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <PatientClinicalWorkspaceView
        model={model}
        patientId={patientId}
        locale={locale}
        onRefresh={() => void load()}
      />
      <PatientHistoryContinuation
        model={model}
        locale={locale}
        loadingFamily={historyLoadingFamily}
        error={historyError}
        onLoad={(family) => void loadHistory(family)}
      />
    </>
  );
}
