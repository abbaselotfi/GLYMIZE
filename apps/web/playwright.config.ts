import { defineConfig, devices } from "@playwright/test";

const runtimeUrl = "http://127.0.0.1:3199";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    ...(process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1"
      ? { channel: "chrome" as const }
      : {}),
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm build && pnpm start",
    env: {
      NEXT_PUBLIC_ADMIN_API_URL: runtimeUrl,
      NEXT_PUBLIC_RUNTIME_API_URL: runtimeUrl,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    url: "http://127.0.0.1:3000",
  },
});
