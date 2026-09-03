export type PatientAccessRole = "editor" | "approver";

export type PatientRouteId =
  | "patient_record.allocator.read"
  | "patient_record.allocator.initialize"
  | "patient_record.archive.read"
  | "patient_record.resolve"
  | "patient_record.legacy.promote"
  | "patient_record.intake.create"
  | "patient_record.patient.create"
  | "patient_record.identifier.create"
  | "patient_record.encounter.create"
  | "patient_record.encounter.read"
  | "patient_record.encounter.revise"
  | "patient_record.encounter.approve"
  | "patient_record.workspace.read"
  | "patient_handoff.legacy.read"
  | "patient_identity.legacy_link.read"
  | "patient_identity.legacy_link.request"
  | "patient_identity.legacy_link.approve"
  | "portal_clinician.submission.read"
  | "portal_clinician.submission.manage"
  | "portal_clinician.submission.approve"
  | "portal_clinician.thread.read"
  | "portal_clinician.thread.write"
  | "portal_clinician.attachment.read"
  | "portal_clinician.account.create";

export const PATIENT_ROUTE_REQUIREMENTS = {
  "patient_record.allocator.read": "editor",
  "patient_record.allocator.initialize": "approver",
  "patient_record.archive.read": "editor",
  "patient_record.resolve": "editor",
  "patient_record.legacy.promote": "editor",
  "patient_record.intake.create": "editor",
  "patient_record.patient.create": "editor",
  "patient_record.identifier.create": "editor",
  "patient_record.encounter.create": "editor",
  "patient_record.encounter.read": "editor",
  "patient_record.encounter.revise": "editor",
  "patient_record.encounter.approve": "approver",
  "patient_record.workspace.read": "editor",
  "patient_handoff.legacy.read": "editor",
  "patient_identity.legacy_link.read": "editor",
  "patient_identity.legacy_link.request": "editor",
  "patient_identity.legacy_link.approve": "approver",
  "portal_clinician.submission.read": "editor",
  "portal_clinician.submission.manage": "editor",
  "portal_clinician.submission.approve": "approver",
  "portal_clinician.thread.read": "editor",
  "portal_clinician.thread.write": "editor",
  "portal_clinician.attachment.read": "editor",
  "portal_clinician.account.create": "editor",
} as const satisfies Record<PatientRouteId, PatientAccessRole>;

export function patientRoleAllows(actual: PatientAccessRole | null, required: PatientAccessRole) {
  return actual === "approver" || actual === required;
}

export function isSelfApproval(actorUserId: string, authorUserId: string | null) {
  return Boolean(authorUserId && actorUserId === authorUserId);
}

export async function readPatientAccessRole(
  database: D1Database,
  userId: string,
  practiceId: string,
): Promise<PatientAccessRole | null> {
  const row = await database
    .prepare(
      `SELECT r.role
     FROM patient_access_role_assignments r
     JOIN practice_memberships m
       ON m.practice_id=r.practice_id AND m.user_id=r.user_id
     JOIN runtime_users u ON u.id=r.user_id
     WHERE r.user_id=? AND r.practice_id=?
       AND m.status='active' AND u.status='active'`,
    )
    .bind(userId, practiceId)
    .first<{ role: PatientAccessRole }>();

  return row?.role === "editor" || row?.role === "approver" ? row.role : null;
}

export async function authorizePatientRoute(
  database: D1Database,
  userId: string,
  practiceId: string,
  route: PatientRouteId,
) {
  const requiredRole = PATIENT_ROUTE_REQUIREMENTS[route];
  const actualRole = await readPatientAccessRole(database, userId, practiceId);
  return {
    allowed: patientRoleAllows(actualRole, requiredRole),
    actualRole,
    requiredRole,
    route,
  };
}
