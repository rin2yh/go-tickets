import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../.dev.vars", import.meta.url)), quiet: true });

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error(
    "Set CLERK_SECRET_KEY in .dev.vars or the process environment before running E2E.",
  );
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
      name: "chromium",
      testMatch: /registration-flow\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "wrangler dev --config wrangler.public.jsonc --local --port 8787 --persist-to .wrangler/e2e",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://localhost:8787/health",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGINT", timeout: 5_000 },
    timeout: 180_000,
  },
});
