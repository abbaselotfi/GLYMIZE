import type {
  PatientLongitudinalHistoryFamily,
  PatientLongitudinalHistoryPage,
  PatientLongitudinalReadModel,
} from "@glymize/contracts/patient-core";
import type { RuntimeReadMetricsCollector } from "../runtime-read-metrics";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import {
  readPatientCoreAllergies,
  readPatientCoreProblems,
} from "./authority-repository";
import { comparePatientContexts, unavailablePatientChangeSet } from "./change-detection";
import { readPatientCoreObservations } from "./observation-reader";
import { emptyPatientContext, projectSnapshotContext } from "./projection";
import { readPatientCoreSummary } from "./patient-summary-reader";
import { readRecentPatientCoreSnapshots } from "./snapshot-reader";
import { readPatientCoreTimeline } from "./timeline-reader";

export interface PatientLongitudinalReadOptions {
  metrics?: RuntimeReadMetricsCollector;
}

export async function readPatientLongitudinalModel(
  context: PatientRecordV2RouteContext,
  patientId: string,
  options: PatientLongitudinalReadOptions = {},
): Promise<PatientLongitudinalReadModel | null> {
  const generatedAt = new Date().toISOString();
  const patient = await readPatientCoreSummary(context, patientId, {
    metrics: options.metrics,
  });
  if (!patient) return null;

  const [snapshots, observations, timeline, allergies, problems] = await Promise.all([
    readRecentPatientCoreSnapshots(context, patientId, 2, {
      metrics: options.metrics,
    }),
    readPatientCoreObservations(context, patientId, {
      sourceVersion: generatedAt,
      metrics: options.metrics,
    }),
    readPatientCoreTimeline(context, patientId, {
      sourceVersion: generatedAt,
      metrics: options.metrics,
    }),
    readPatientCoreAllergies(context, patientId, { metrics: options.metrics }),
    readPatientCoreProblems(context, patientId, { metrics: options.metrics }),
  ]);

  const currentSnapshot = snapshots[0];
  const baselineSnapshot = snapshots[1];
  const projectedCurrent = currentSnapshot
    ? projectSnapshotContext(patient, context.user.practiceId, currentSnapshot)
    : emptyPatientContext(patient, context.user.practiceId, generatedAt);

  const currentContext = {
    ...projectedCurrent,
    generatedAt,
    allergies,
    problems,
    observations,
  };

  const currentAnchor = currentSnapshot
    ? {
        encounterId: currentSnapshot.encounterId,
        effectiveAt: currentSnapshot.encounterAt,
        snapshotRevision: currentSnapshot.revision,
      }
    : undefined;

  // The dedicated Allergy/Problem authorities are longitudinal and not tied to an
  // encounter-snapshot revision. Until a revision-time change reader is reviewed,
  // keep encounter-to-encounter comparison on its existing snapshot projection so
  // pre-existing authoritative facts cannot be mislabeled as newly added.
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

export async function readPatientLongitudinalHistoryPage(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: PatientLongitudinalHistoryFamily,
  cursor: string,
  options: PatientLongitudinalReadOptions = {},
): Promise<PatientLongitudinalHistoryPage | null> {
  const patient = await readPatientCoreSummary(context, patientId, {
    metrics: options.metrics,
  });
  if (!patient) return null;

  const generatedAt = new Date().toISOString();
  if (family === "observations") {
    const collection = await readPatientCoreObservations(context, patientId, {
      cursor,
      metrics: options.metrics,
    });
    if (!collection.continuation) {
      throw new Error("PATIENT_HISTORY_CONTINUATION_MISSING");
    }
    return {
      schemaVersion: 1,
      generatedAt,
      scope: { practiceId: context.user.practiceId, patientId },
      family,
      collection: { ...collection, continuation: collection.continuation },
    };
  }

  const collection = await readPatientCoreTimeline(context, patientId, {
    cursor,
    metrics: options.metrics,
  });
  if (!collection.continuation) {
    throw new Error("PATIENT_HISTORY_CONTINUATION_MISSING");
  }
  return {
    schemaVersion: 1,
    generatedAt,
    scope: { practiceId: context.user.practiceId, patientId },
    family,
    collection: { ...collection, continuation: collection.continuation },
  };
}
