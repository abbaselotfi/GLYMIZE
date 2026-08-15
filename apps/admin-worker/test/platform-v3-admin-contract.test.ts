import fs from "node:fs";
import { describe, expect, it } from "vitest";

const workerPermissionKeys = [
  "dashboard",
  "type2",
  "type1",
  "pregnancy",
  "insulin_tools",
  "evidence",
  "care_team",
  "handoff.read",
  "handoff.write",
  "admin.center",
  "admin.medications",
  "admin.data_updates",
  "admin.master_registry",
  "admin.users",
  "admin.ai_models",
  "admin.communications",
  "admin.notifications",
] as const;

describe("platform v3 admin user-management and page-permission contract", () => {
  it("enables Admin Users and routes through the dedicated admin module", () => {
    const platform = fs.readFileSync(
      new URL("../src/platform-v3.ts", import.meta.url),
      "utf8",
    );
    expect(platform).toContain(
      'import { adminRuntimeRoute } from "./platform-v3-admin"',
    );
    expect(platform).toContain("adminUsers: true");
    expect(platform).toContain("await adminRuntimeRoute(request, env)");
  });

  it("keeps public physician registration fail-closed while admin creation is manual", () => {
    const publicPlatform = fs.readFileSync(
      new URL("../src/platform-index.ts", import.meta.url),
      "utf8",
    );
    const admin = fs.readFileSync(
      new URL("../src/platform-v3-admin.ts", import.meta.url),
      "utf8",
    );

    expect(publicPlatform).toContain("verifyIrimc(env");
    expect(publicPlatform).toContain('error:"irimc_provider_unavailable"');
    expect(publicPlatform).toContain('error:"irimc_exact_match_failed"');
    expect(publicPlatform).toContain(
      'const irimcVerified = input.verificationSource === "irimc_exact"',
    );

    expect(admin).toContain("'admin_manual'");
    expect(admin).toContain("'unavailable'");
    expect(admin).not.toContain("verifyIrimc(");
  });

  it("keeps worker and web page-permission registries synchronized", () => {
    const security = fs.readFileSync(
      new URL("../src/runtime-security.ts", import.meta.url),
      "utf8",
    );
    const webPermissions = fs.readFileSync(
      new URL("../../web/lib/runtime-permissions.ts", import.meta.url),
      "utf8",
    );
    for (const permission of workerPermissionKeys) {
      expect(security).toContain(`"${permission}"`);
      expect(webPermissions).toContain(`"${permission}"`);
    }
    expect(security).toContain("sanitizeRuntimePermissions");
    expect(security).toContain("defaultPhysicianPermissions");
  });

  it("does not give physicians an implicit permission bypass", () => {
    const publicPlatform = fs.readFileSync(
      new URL("../src/platform-index.ts", import.meta.url),
      "utf8",
    );
    const base = fs.readFileSync(
      new URL("../src/platform-v3-base.ts", import.meta.url),
      "utf8",
    );
    expect(publicPlatform).toContain(
      "return user.permissions.includes(permission);",
    );
    expect(publicPlatform).not.toContain(
      'return user.role === "physician" || user.permissions.includes(permission)',
    );
    expect(base).toContain("sanitizeRuntimePermissions");
    expect(base).not.toContain("physicianPermissions");
  });

  it("provides safe list/create/update/password-reset/delete user management", () => {
    const admin = fs.readFileSync(
      new URL("../src/platform-v3-admin.ts", import.meta.url),
      "utf8",
    );
    expect(admin).toContain("/v1/admin/runtime/users");
    expect(admin).toContain('permissions.includes("admin.users")');
    expect(admin).toContain("createPhysician");
    expect(admin).toContain("sanitizeRuntimePermissions(body.permissions)");
    expect(admin).toContain("updateUser");
    expect(admin).toContain("resetPassword");
    expect(admin).toContain("purgeOrDeleteUser");
    expect(admin).toContain("delete_confirmation_required");
    expect(admin).toContain("self_delete_requires_github_superadmin");
    expect(admin).toContain("UPDATE refresh_tokens");
    expect(admin).toContain("clinicalHistoryPreserved: true");
    expect(admin).not.toContain("DELETE FROM patient_handoffs");
  });

  it("accepts runtime admins by page scope but keeps GitHub publishing superadmin-only", () => {
    const legacy = fs.readFileSync(
      new URL("../src/index.ts", import.meta.url),
      "utf8",
    );
    expect(legacy).toContain("runtimeAdminFromToken");
    expect(legacy).toContain('"admin.communications"');
    expect(legacy).toContain('"admin.ai_models"');
    expect(legacy).toContain("github_superadmin_required");
    expect(legacy).toContain('session.source !== "github"');
    expect(legacy).toContain('"RUNTIME-ACCESS-V1"');
  });

  it("exposes create/edit/delete/export and per-page selectors in the user console", () => {
    const client = fs.readFileSync(
      new URL("../../web/lib/admin-runtime-users.ts", import.meta.url),
      "utf8",
    );
    const page = fs.readFileSync(
      new URL("../../web/app/admin/users/page.tsx", import.meta.url),
      "utf8",
    );
    expect(client).toContain("createRuntimePhysicianAdmin");
    expect(client).toContain("deleteRuntimeUserAdmin");
    expect(client).toContain("downloadRuntimeUsersCsv");
    expect(client).toContain("permissions:RuntimePermission[]");
    expect(page).toContain("Create with admin override");
    expect(page).toContain("Edit details");
    expect(page).toContain("RUNTIME_PERMISSION_GROUPS");
    expect(page).toContain("admin.users");
    expect(page).toContain("Export CSV");
    expect(page).toContain("Delete account");
  });

  it("gates clinical and admin navigation using the stored runtime permission set", () => {
    const shell = fs.readFileSync(
      new URL("../../web/app/components/app-shell.tsx", import.meta.url),
      "utf8",
    );
    const guard = fs.readFileSync(
      new URL("../../web/app/components/admin-auth-guard.tsx", import.meta.url),
      "utf8",
    );
    const nav = fs.readFileSync(
      new URL("../../web/app/admin/admin-workspace-nav.tsx", import.meta.url),
      "utf8",
    );
    expect(shell).toContain("permissionForClinicalPath");
    expect(shell).toContain(
      "NAVIGATION.filter((item) => user.permissions.includes(item.permission))",
    );
    expect(guard).toContain("permissionForAdminPath(pathname)");
    expect(guard).toContain("firstAllowedAdminPath(user.permissions)");
    expect(nav).toContain(
      "githubSuperadmin || permissions.includes(item.key)",
    );
  });
});
