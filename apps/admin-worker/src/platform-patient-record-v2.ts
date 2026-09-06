import type { PatientWorkspaceSnapshot } from "@glymize/contracts";
import {
  patientRecordV2Route as patientRecordV2CoreRoute,
} from "./platform-patient-record-v2-core";
import { readPatientWorkspaceOrders } from "./patient-record-v2/orders";
import type { PatientRecordV2RouteContext } from "./patient-record-v2/context";

export type { PatientRecordV2RouteContext } from "./patient-record-v2/context";

/**
 * Patient Record v2 route facade.
 *
 * The historical route implementation remains in the core module. This facade
 * enriches the already-authorized Patient Workspace response with the signed
 * physician-order read model. No parallel patient authority or storage is
 * introduced here.
 */
export async function patientRecordV2Route(
  request: Request,
  context: PatientRecordV2RouteContext,
): Promise<Response | null> {
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
