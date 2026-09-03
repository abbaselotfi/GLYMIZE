# Patient-access RBAC

Status: accepted for Phase 0 / Task 6 on 2026-09-03.

## Boundary

Patient-adjacent Worker operations are authorized from D1 on every request.
Authentication alone is insufficient. Existing runtime permissions such as
`handoff.read` and `handoff.write` remain an additional, narrower gate.

`patient_access_role_assignments` stores one practice-scoped role:

- `editor` may read patient data and author or revise draft changes;
- `approver` includes editor access and may perform approval transitions.

Migration `0018_patient_access_rbac.sql` maps active physicians to `approver`
and active assistants to `editor` to preserve current access. Database triggers
assign a role to new memberships and remove or refresh it when a membership's
clinical role or active status changes. An absent assignment fails closed.

The policy covers every route dispatched by Patient Record v2, encounter
creation/read/revision, retained read-only legacy handoffs, clinician-side
patient-portal submissions/messages/attachments/accounts, and reviewed legacy
patient-identity links. Approval transitions additionally reject an actor who
authored the encounter or requested the identity link.

Patient-owned portal and global-patient-identity routes retain their dedicated
patient session boundaries. They do not receive clinician roles: applying a
staff role to a patient session would collapse two intentionally separate trust
domains.

## Temporary catalogue exception

`POST /catalog/publish` is not a patient-adjacent route. It temporarily retains
the existing `ALLOWED_GITHUB_LOGIN` OAuth principal and remains explicitly
restricted to a GitHub-sourced admin session. Replacing catalogue publication
with separate content-editor/content-approver roles is deferred to the
catalogue workflow and persistence decisions; this exception grants no access
to patient, portal, or encounter data.

## Rollout

Apply D1 migration `0018` before deploying the matching Worker build. Validate
the role seed, a missing-role denial, editor draft access, editor approval
denial, approver access, and self-approval denial in RC/staging before any
production release decision. This repository task does not apply remote
migrations, alter secrets, enable feature flags, or deploy the Worker.
