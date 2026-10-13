import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../.dev.vars", import.meta.url)), quiet: true });

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error(
    "Set CLERK_SECRET_KEY in .dev.vars or the process environment before running the Admin VRT.",
  );
}

export default defineConfig({
  testDir: "./tests",
  testMatch: /admin-vrt\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results/admin-vrt",
  expect: {
    toHaveScreenshot: {
      pathTemplate: "../admin/screenshots/{arg}{ext}",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @go-tickets/admin exec vite --host 127.0.0.1 --port 5173 --strictPort",
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
