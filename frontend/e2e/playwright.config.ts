import { defineConfig, devices } from "@playwright/test";

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
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "mise run e2e-dev",
    url: "http://localhost:8787/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
