import type { PatientModuleHandoffIntent } from "@glymize/contracts/clinical-modules";
import { type2PatientCoreHandoffMatchesIntent, type Type2PatientCoreHandoffCandidate } from "./type2-patient-core-handoff";

export type Type2HandoffReviewState = {
  state: "idle" | "loading" | "ready" | "confirming" | "confirmed" | "invalid";
  candidate: Type2PatientCoreHandoffCandidate | null;
  error: string;
};
type Actor = { id: string; practiceId: string; status: "active" | "disabled" };
type Dependencies = {
  currentActor: () => Actor | null;
  readIntent: () => PatientModuleHandoffIntent | null;
  clearIntent: () => void;
  readCandidate: (intent: PatientModuleHandoffIntent, signal: AbortSignal) => Promise<Type2PatientCoreHandoffCandidate>;
  publish: (state: Type2HandoffReviewState) => void;
};

/** Review lifecycle only; clinical mapping and HTTP validation stay separate. */
export function createType2HandoffReviewController(deps: Dependencies) {
  let state: Type2HandoffReviewState = { state: "idle", candidate: null, error: "" };
  let generation = 0;
  let controller: AbortController | null = null;
  let actor: Actor | null = null;
  let intent: PatientModuleHandoffIntent | null = null;
  function publish(next: Type2HandoffReviewState) {
    state = next;
    deps.publish(next);
  }
  function cancel() {
    generation += 1;
    controller?.abort();
    controller = null;
  }
  function currentActorMatches() {
    const current = deps.currentActor();
    return Boolean(actor && current && current.status === "active" &&
      current.id === actor.id && current.practiceId === actor.practiceId);
  }
  function assertActive() {
    if (!currentActorMatches()) {
      throw new Error("PATIENT_MODULE_HANDOFF_AUTH_CHANGED");
    }
    const current = deps.currentActor()!;
    const currentIntent = deps.readIntent();
    if (!intent || !currentIntent || current.practiceId !== intent.scope.practiceId ||
      currentIntent.moduleId !== intent.moduleId ||
      currentIntent.scope.patientId !== intent.scope.patientId ||
      currentIntent.scope.practiceId !== intent.scope.practiceId ||
      currentIntent.sourceRevisionFingerprint !== intent.sourceRevisionFingerprint) {
      throw new Error("PATIENT_MODULE_HANDOFF_CONTEXT_CHANGED");
    }
  }
  function invalidate(error = "PATIENT_MODULE_HANDOFF_AUTH_CHANGED") {
    cancel();
    deps.clearIntent();
    publish({ state: "invalid", candidate: null, error });
  }
  async function read(phase: "loading" | "confirming") {
    cancel();
    const expectedGeneration = generation;
    controller = new AbortController();
    const signal = controller.signal;
    publish({ state: phase, candidate: null, error: "" });
    try {
      assertActive();
      const nextCandidate = await deps.readCandidate(intent!, signal);
      if (signal.aborted || generation !== expectedGeneration) return null;
      assertActive();
      if (!type2PatientCoreHandoffMatchesIntent(nextCandidate, intent!)) {
        throw new Error("PATIENT_MODULE_HANDOFF_SOURCE_CHANGED");
      }
      return nextCandidate;
    } catch (cause) {
      if (!signal.aborted && generation === expectedGeneration) {
        invalidate(cause instanceof Error ? cause.message : "PATIENT_MODULE_HANDOFF_FAILED");
      }
      return null;
    }
  }
  return {
    async start() {
      cancel();
      intent = deps.readIntent();
      if (!intent) {
        publish({ state: "idle", candidate: null, error: "" });
        return;
      }
      const currentActor = deps.currentActor();
      actor = currentActor ? { ...currentActor } : null;
      const expectedGeneration = generation + 1;
      const candidate = await read("loading");
      if (candidate && generation === expectedGeneration) publish({ state: "ready", candidate, error: "" });
    },
    async confirm(apply: (candidate: Type2PatientCoreHandoffCandidate) => void) {
      if (state.state !== "ready" || !state.candidate) return false;
      const expectedGeneration = generation + 1;
      const candidate = await read("confirming");
      if (!candidate || generation !== expectedGeneration) return false;
      try {
        assertActive();
      } catch (cause) {
        invalidate(cause instanceof Error ? cause.message : "PATIENT_MODULE_HANDOFF_FAILED");
        return false;
      }
      apply(candidate);
      deps.clearIntent();
      publish({ state: "confirmed", candidate, error: "" });
      return true;
    },
    handleAuthChange() {
      if ((state.state === "loading" || state.state === "ready" || state.state === "confirming") &&
        !currentActorMatches()) {
        invalidate();
      }
    },
    invalidate,
    discard() {
      cancel();
      deps.clearIntent();
      publish({ state: "idle", candidate: null, error: "" });
    },
    // Retain the descriptor on unmount for StrictMode/remount.
    dispose: cancel,
  };
}
