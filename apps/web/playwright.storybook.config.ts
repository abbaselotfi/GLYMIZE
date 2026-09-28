import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./storybook-e2e",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:6006",
    ...(process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1"
      ? { channel: "chrome" as const }
      : {}),
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm storybook --ci --no-open",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    url: "http://127.0.0.1:6006",
  },
});
