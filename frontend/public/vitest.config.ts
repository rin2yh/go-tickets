import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
      reportsDirectory: "../coverage/public",
    },
  },
});
