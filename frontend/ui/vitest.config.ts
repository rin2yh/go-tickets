import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
      reportsDirectory: "../coverage/ui",
    },
  },
});
