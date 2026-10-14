import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
      reportsDirectory: "../coverage/ui",
    },
  },
});
