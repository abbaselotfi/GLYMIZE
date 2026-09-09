import type { PatientLongitudinalReadModel } from "@glymize/contracts/patient-core";

export type PatientWorkspaceReadScope = {
  actorId: string;
  practiceId: string;
  patientId: string;
};

export type PatientWorkspaceRuntimeContext = {
  id: string;
  practiceId: string;
  status: "active" | "disabled";
};

export function isPatientWorkspaceReadScopeActive(
  scope: PatientWorkspaceReadScope,
  runtimeContext: PatientWorkspaceRuntimeContext | null,
) {
  return Boolean(
    runtimeContext &&
      runtimeContext.status === "active" &&
      runtimeContext.id === scope.actorId &&
      runtimeContext.practiceId === scope.practiceId,
  );
}

export type PatientLongitudinalReadLoader = (
  scope: PatientWorkspaceReadScope,
  signal: AbortSignal,
) => Promise<PatientLongitudinalReadModel>;

export type PatientLongitudinalReadResult =
  | {
      status: "current";
      scope: PatientWorkspaceReadScope;
      model: PatientLongitudinalReadModel;
    }
  | { status: "obsolete" };

export function createLatestPatientLongitudinalReader(loader: PatientLongitudinalReadLoader) {
  let generation = 0;
  let activeController: AbortController | null = null;

  return {
    async read(scope: PatientWorkspaceReadScope): Promise<PatientLongitudinalReadResult> {
      const requestGeneration = ++generation;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const model = await loader(scope, controller.signal);
        if (controller.signal.aborted || requestGeneration !== generation) {
          return { status: "obsolete" };
        }
        return { status: "current", scope, model };
      } catch (cause) {
        if (controller.signal.aborted || requestGeneration !== generation) {
          return { status: "obsolete" };
        }
        throw cause;
      } finally {
        if (activeController === controller) activeController = null;
      }
    },

    invalidate() {
      generation += 1;
      activeController?.abort();
      activeController = null;
    },
  };
}
