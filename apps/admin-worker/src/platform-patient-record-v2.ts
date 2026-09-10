import type { PatientWorkspaceSnapshot } from "@glymize/contracts";
import { patientClinicalCoreRoute } from "./patient-core/route";
import {
  patientRecordV2Route as patientRecordV2CoreRoute,
} from "./platform-patient-record-v2-core";
import { readPatientWorkspaceOrders } from "./patient-record-v2/orders";
import type { PatientRecordV2RouteContext } from "./patient-record-v2/context";

export type { PatientRecordV2RouteContext } from "./patient-record-v2/context";

export interface PatientRecordV2RolloutOptions {
  patientCoreAllergyProblemAuthorityEnabled?: boolean;
}

/**
 * Patient Record v2 route facade.
 *
 * New bounded Patient Clinical Core read concerns are intercepted here before
 * the historical core route. The legacy implementation remains the write/
 * compatibility authority while new read-model logic stays modular.
 */
export async function patientRecordV2Route(
  request: Request,
  context: PatientRecordV2RouteContext,
  rollout: PatientRecordV2RolloutOptions = {},
): Promise<Response | null> {
  const patientCoreResponse = await patientClinicalCoreRoute(
    request,
    context,
    {
      allergyProblemAuthorityEnabled:
        rollout.patientCoreAllergyProblemAuthorityEnabled === true,
    },
  );
  if (patientCoreResponse) return patientCoreResponse;

  const response = await patientRecordV2CoreRoute(request, context);
  if (!response) return null;

  const url = new URL(request.url);
  const workspaceMatch = url.pathname.match(
    /^\/v1\/patients\/([^/]+)\/workspace$/,
  );
  if (
    !workspaceMatch ||
    request.method !== "GET" ||
    !response.ok
  ) {
    return response;
  }

  const patientId = decodeURIComponent(workspaceMatch[1]!);
  const workspace = await response.json() as PatientWorkspaceSnapshot;
  const orders = await readPatientWorkspaceOrders(context, patientId);

  return context.respond(
    {
      ...workspace,
      orders,
    },
    response.status,
  );
}
