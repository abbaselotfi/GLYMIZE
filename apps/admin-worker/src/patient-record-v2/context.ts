import type { LayoutPreset, RuntimePermission, RuntimeRole } from "../runtime-security";
import type { PatientRouteId } from "../patient-access-rbac";

export type PatientRecordUser = {
  id: string;
  role: RuntimeRole;
  practiceId: string;
  permissions: RuntimePermission[];
  layoutPreset: LayoutPreset;
};

export type PatientRecordV2RouteContext = {
  database: D1Database;
  clinicalSecret: string;
  user: PatientRecordUser;
  authorize: (route: PatientRouteId) => Promise<boolean>;
  respond: (body: unknown, status?: number) => Response;
  audit: (action: string, targetType?: string, targetId?: string, meta?: unknown) => Promise<void>;
};
