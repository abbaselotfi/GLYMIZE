"use client";

import { useEffect, useMemo, useState } from "react";
import { getPatientLongitudinalReadModel } from "./patient-clinical-core-client";
import { clearPatientModuleHandoffIntent, readPatientModuleHandoffIntent } from "./patient-module-handoff";
import { buildType2PatientCoreHandoffCandidate, TYPE2_PATIENT_CORE_MODULE_ID } from "./type2-patient-core-handoff";
import { createType2HandoffReviewController, type Type2HandoffReviewState } from "./type2-handoff-review-controller";
import { getCachedRuntimeUser, initializeRuntimeSession, runtimeAuthEventName } from "./runtime-client";

export type Type2PatientCoreHandoffState = Type2HandoffReviewState["state"];

export function useType2PatientCoreHandoff() {
  const [review, setReview] = useState<Type2HandoffReviewState>({ state: "idle", candidate: null, error: "" });
  const controller = useMemo(() => createType2HandoffReviewController({
    currentActor: getCachedRuntimeUser,
    readIntent: () => readPatientModuleHandoffIntent(TYPE2_PATIENT_CORE_MODULE_ID),
    clearIntent: clearPatientModuleHandoffIntent,
    async readCandidate(intent, signal) {
      const model = await getPatientLongitudinalReadModel(intent.scope.patientId, {
        expectedPracticeId: intent.scope.practiceId,
        signal,
      });
      return buildType2PatientCoreHandoffCandidate(model);
    },
    publish: setReview,
  }), []);

  useEffect(() => {
    let disposed = false;
    let started = false;
    const onAuthChange = () => { if (started) controller.handleAuthChange(); };
    window.addEventListener(runtimeAuthEventName(), onAuthChange);
    void (async () => {
      if (!getCachedRuntimeUser()) await initializeRuntimeSession();
      if (disposed) return;
      started = true;
      await controller.start();
    })();
    return () => {
      disposed = true;
      window.removeEventListener(runtimeAuthEventName(), onAuthChange);
      controller.dispose();
    };
  }, [controller]);

  return { ...review, confirm: controller.confirm, discard: controller.discard };
}
