"use client";

import { useCallback, useEffect, useState } from "react";
import { getPatientLongitudinalReadModel } from "./patient-clinical-core-client";
import {
  clearPatientModuleHandoffIntent,
  readPatientModuleHandoffIntent,
} from "./patient-module-handoff";
import {
  buildType2PatientCoreHandoffCandidate,
  type2PatientCoreHandoffMatchesIntent,
  TYPE2_PATIENT_CORE_MODULE_ID,
  type Type2PatientCoreHandoffCandidate,
} from "./type2-patient-core-handoff";
import {
  getCachedRuntimeUser,
  initializeRuntimeSession,
} from "./runtime-client";

export type Type2PatientCoreHandoffState =
  | "idle"
  | "loading"
  | "ready"
  | "confirmed"
  | "invalid";

function errorCode(cause: unknown) {
  return cause instanceof Error && cause.message
    ? cause.message
    : "PATIENT_MODULE_HANDOFF_FAILED";
}

export function useType2PatientCoreHandoff() {
  const [state, setState] = useState<Type2PatientCoreHandoffState>("idle");
  const [candidate, setCandidate] =
    useState<Type2PatientCoreHandoffCandidate | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const intent = readPatientModuleHandoffIntent(TYPE2_PATIENT_CORE_MODULE_ID);
    if (!intent) return;

    let cancelled = false;
    setState("loading");
    setCandidate(null);
    setError("");

    void (async () => {
      const user = getCachedRuntimeUser() ?? await initializeRuntimeSession();
      if (!user || user.status !== "active") {
        throw new Error("PATIENT_MODULE_HANDOFF_AUTH_REQUIRED");
      }
      if (user.practiceId !== intent.scope.practiceId) {
        throw new Error("PATIENT_MODULE_HANDOFF_PRACTICE_MISMATCH");
      }

      const model = await getPatientLongitudinalReadModel(
        intent.scope.patientId,
        { expectedPracticeId: intent.scope.practiceId },
      );
      const nextCandidate = buildType2PatientCoreHandoffCandidate(model);
      if (!type2PatientCoreHandoffMatchesIntent(nextCandidate, intent)) {
        throw new Error("PATIENT_MODULE_HANDOFF_SOURCE_CHANGED");
      }
      if (cancelled) return;
      setCandidate(nextCandidate);
      setState("ready");
    })().catch((cause) => {
      if (cancelled) return;
      clearPatientModuleHandoffIntent();
      setCandidate(null);
      setError(errorCode(cause));
      setState("invalid");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = useCallback((
    apply: (candidate: Type2PatientCoreHandoffCandidate) => void,
  ) => {
    if (state !== "ready" || !candidate) return false;
    apply(candidate);
    clearPatientModuleHandoffIntent();
    setState("confirmed");
    return true;
  }, [candidate, state]);

  const discard = useCallback(() => {
    clearPatientModuleHandoffIntent();
    setCandidate(null);
    setError("");
    setState("idle");
  }, []);

  return {
    state,
    candidate,
    error,
    confirm,
    discard,
  };
}
