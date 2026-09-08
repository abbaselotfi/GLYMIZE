import type { PatientLongitudinalReadModel } from "@glymize/contracts/patient-core";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { comparePatientContexts, unavailablePatientChangeSet } from "./change-detection";
import { readPatientCoreObservations } from "./observation-reader";
import { emptyPatientContext, projectSnapshotContext } from "./projection";
import { readPatientCoreSummary } from "./patient-summary-reader";
import { readRecentPatientCoreSnapshots } from "./snapshot-reader";
import { readPatientCoreTimeline } from "./timeline-reader";

export async function readPatientLongitudinalModel(
  context: PatientRecordV2RouteContext,
  patientId: string,
): Promise<PatientLongitudinalReadModel | null> {
  const patient = await readPatientCoreSummary(context, patientId);
  if (!patient) return null;

  const generatedAt = new Date().toISOString();
  const [snapshots, observations, timeline] = await Promise.all([
    readRecentPatientCoreSnapshots(context, patientId, 2),
    readPatientCoreObservations(context, patientId),
    readPatientCoreTimeline(context, patientId),
  ]);

  const currentSnapshot = snapshots[0];
  const baselineSnapshot = snapshots[1];
  const projectedCurrent = currentSnapshot
    ? projectSnapshotContext(patient, context.user.practiceId, currentSnapshot)
    : emptyPatientContext(patient, context.user.practiceId, generatedAt);

  // Longitudinal observation index is more complete than the latest encounter
  // snapshot alone, while medications and cross-cutting context remain current-
  // snapshot projections until dedicated longitudinal authorities are introduced.
  const currentContext = {
    ...projectedCurrent,
    generatedAt,
    observations,
  };

  const currentAnchor = currentSnapshot
    ? {
        encounterId: currentSnapshot.encounterId,
        effectiveAt: currentSnapshot.encounterAt,
        snapshotRevision: currentSnapshot.revision,
      }
    : undefined;

  const changesSincePreviousEncounter =
    currentSnapshot && baselineSnapshot
      ? comparePatientContexts(
          projectSnapshotContext(
            patient,
            context.user.practiceId,
            baselineSnapshot,
          ),
          projectSnapshotContext(
            patient,
            context.user.practiceId,
            currentSnapshot,
          ),
          {
            encounterId: baselineSnapshot.encounterId,
            effectiveAt: baselineSnapshot.encounterAt,
            snapshotRevision: baselineSnapshot.revision,
          },
          currentAnchor!,
          generatedAt,
        )
      : unavailablePatientChangeSet(
          currentContext,
          currentAnchor,
          generatedAt,
        );

  return {
    schemaVersion: 1,
    generatedAt,
    context: currentContext,
    timeline,
    changesSincePreviousEncounter,
  };
}
