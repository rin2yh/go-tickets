import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../.dev.vars", import.meta.url)), quiet: true });

for (const name of ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "E2E_CLERK_USER_EMAIL"]) {
  if (!process.env[name]) throw new Error(`Set ${name} before running the E2E suite.`);
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "./test-results",
  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "clerk-setup",
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: "chromium",
      testMatch: /registration-flow\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["clerk-setup"],
    },
  ],
  webServer: {
    command: "mise run e2e-dev",
    url: "http://localhost:8787/health",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
