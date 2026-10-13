import { resolve } from "node:path";
import common from "../oxlint.config.json" with { type: "json" };

export default {
  ...common,
  jsPlugins: ["eslint-plugin-boundaries"],
  settings: {
    "boundaries/root-path": resolve(import.meta.dirname),
    "boundaries/include": ["src/**/*.{ts,tsx}"],
    "boundaries/elements": [
      { type: "public-page", pattern: "src/pages/*", partialMatch: false, capture: ["slice"] },
      { type: "public-widget", pattern: "src/layouts/*", partialMatch: false, capture: ["slice"] },
      { type: "public-feature", pattern: "src/components", partialMatch: false },
      { type: "public-shared", pattern: "src/lib", partialMatch: false },
      { type: "public-app", pattern: "src", partialMatch: false },
    ],
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: [resolve(import.meta.dirname, "tsconfig.json")],
      },
      node: true,
    },
  },
  rules: {
    ...common.rules,
    "boundaries/no-unknown-dependencies": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        policies: [
          {
            from: { element: { type: "public-app" } },
            allow: {
              to: {
                element: {
                  type: ["public-page", "public-widget", "public-feature", "public-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "public-page" } },
            allow: {
              to: {
                element: {
                  type: ["public-widget", "public-feature", "public-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "public-widget" } },
            allow: {
              to: {
                element: {
                  type: ["public-feature", "public-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "public-feature" } },
            allow: {
              to: { element: { type: "public-shared", fileInternalPath: "index.ts" } },
            },
          },
        ],
      },
    ],
  },
};
