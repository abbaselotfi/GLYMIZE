import { expect, test, type Page } from "@playwright/test";

const runtimeOrigin = "http://127.0.0.1:3199";

const clinician = {
  id: "assistant-e2e",
  role: "assistant",
  status: "active",
  firstName: "Care",
  lastName: "Assistant",
  layoutPreset: "auto",
  practiceId: "practice-e2e",
  practiceName: "E2E Practice",
  permissions: ["type2", "care_team", "handoff.read", "handoff.write"],
};

async function useEnglish(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("glymize-ui-language", "en");
  });
}

async function useClinicianSession(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("glymize-ui-language", "en");
    window.sessionStorage.setItem("glymize-runtime-access-v1", "clinician-access");
  });
  await page.route(`${runtimeOrigin}/v1/session`, (route) =>
    route.fulfill({ json: clinician }),
  );
}

test("admin login handoff opens an authenticated admin page", async ({ page }) => {
  await useEnglish(page);
  await page.route(`${runtimeOrigin}/session`, (route) =>
    route.fulfill({
      json: {
        login: "owner-e2e",
        expiresAt: "2099-01-01T00:00:00.000Z",
        source: "github",
        permissions: [],
      },
    }),
  );

  await page.goto("/admin#auth_session=e2e-admin-session");

  await expect(page.getByText("@owner-e2e")).toBeVisible();
  await expect(page).not.toHaveURL(/auth_session/);
  await expect(page.getByText("اطلاعات WorldDrug، کاتالوگ، پروتکل‌ها و منابع علمی با موفقیت بازخوانی شد.")).toBeVisible();
});

test("Type 2 assessment produces ranked scenarios", async ({ page }) => {
  await useClinicianSession(page);
  await page.goto("/type-2");

  await page.getByLabel("Current A1C").fill("8.7");
  await page.getByLabel("Target A1C").fill("7.0");
  await page.getByRole("button", { name: "Build treatment scenarios" }).click();

  await expect(page.getByRole("heading", {
    name: /\d+ treatment scenarios(?: \+ WorldDrug review)?/,
  })).toBeVisible();
  await expect(page.getByText("A1C gap")).toBeVisible();
});

test("Care Team creates and saves a patient handoff", async ({ page }) => {
  await useClinicianSession(page);
  let intakePayload: Record<string, unknown> | undefined;
  await page.route(`${runtimeOrigin}/v1/patients/resolve`, (route) =>
    route.fulfill({
      status: 404,
      json: { found: false, resolvedKind: "file_number" },
    }),
  );
  await page.route(`${runtimeOrigin}/v1/patients/care-team-intake`, async (route) => {
    intakePayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        patient: {
          patientId: "patient-e2e",
          status: "active",
          demographics: { firstName: "Ada", lastName: "Test" },
          identifiers: [{
            id: "identifier-e2e",
            kind: "file_number",
            displayMask: "••1042",
            isPrimary: true,
          }],
        },
        encounter: {
          encounterId: "encounter-e2e",
          patientId: "patient-e2e",
          encounterAt: "2026-09-03T08:00:00.000Z",
          encounterKind: "outpatient",
          source: "care_team",
          status: "ready_for_physician",
          latestSnapshotRevision: 1,
        },
        observationCount: 0,
        allocator: { status: "ready", displayWidth: 4 },
      },
    });
  });

  await page.goto("/care-team");
  await page.getByLabel("Patient code *").fill("1042");
  await page.getByLabel("First name (optional)").fill("Ada");
  await page.getByLabel("Last name (optional)").fill("Test");
  await page.getByRole("button", { name: "Save handoff" }).click();

  await expect(page.getByRole("status"))
    .toContainText("Handoff ready for physician · revision 1");
  expect(intakePayload).toMatchObject({
    identifier: { kind: "file_number", value: "1042", isPrimary: true },
    demographics: { firstName: "Ada", lastName: "Test" },
  });
});

test("patient portal login displays an existing record", async ({ page }) => {
  await useEnglish(page);
  await page.route(`${runtimeOrigin}/v1/patient-identity/capabilities`, (route) =>
    route.fulfill({ json: { patientIdentityV2: false, selfRegistration: false } }),
  );
  await page.route(`${runtimeOrigin}/v1/platform-v3`, (route) =>
    route.fulfill({ json: { capabilities: { patientPortal: true } } }),
  );
  await page.route(`${runtimeOrigin}/v1/portal/auth/login`, (route) =>
    route.fulfill({
      json: {
        accessToken: "portal-access",
        accessExpiresAt: "2099-01-01T00:00:00.000Z",
        refreshToken: "portal-refresh",
        refreshExpiresAt: "2099-02-01T00:00:00.000Z",
        persistent: false,
        mustChangePassword: false,
      },
    }),
  );
  await page.route(`${runtimeOrigin}/v1/portal/session`, (route) => {
    const authorized = route.request().headers().authorization === "Bearer portal-access";
    return authorized
      ? route.fulfill({
          json: {
            user: {
              portalUserId: "portal-user-e2e",
              practiceId: "practice-e2e",
              patientId: "patient-e2e",
              mustChangePassword: false,
            },
          },
        })
      : route.fulfill({ status: 401, json: { error: "auth_required" } });
  });
  await page.route(`${runtimeOrigin}/v1/portal/submissions`, (route) =>
    route.fulfill({
      json: {
        submissions: [{
          id: "submission-e2e",
          kind: "labs",
          status: "pending",
          createdAt: "2026-09-03T08:00:00.000Z",
        }],
      },
    }),
  );
  await page.route(`${runtimeOrigin}/v1/portal/threads`, (route) =>
    route.fulfill({ json: { threads: [] } }),
  );

  await page.goto("/portal");
  await page.getByLabel("Mobile or email").fill("patient@example.test");
  await page.getByLabel("Password").fill("patient-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Patient Portal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Previous submissions" })).toBeVisible();
  await expect(page.getByText("labs", { exact: true })).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();
});
