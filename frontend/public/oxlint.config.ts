import { resolve } from "node:path";
import common from "../.oxlintrc.json" with { type: "json" };

export default {
  ...common,
  jsPlugins: ["eslint-plugin-boundaries"],
  settings: {
    "boundaries/root-path": resolve(import.meta.dirname),
    "boundaries/include": ["src/**/*.{ts,tsx}"],
    "boundaries/elements": [
      { type: "public-page", pattern: "src/pages/*", partialMatch: false, capture: ["slice"] },
      { type: "public-screen", pattern: "src/screens/*", partialMatch: false, capture: ["slice"] },
      { type: "public-layout", pattern: "src/layouts/*", partialMatch: false, capture: ["slice"] },
      { type: "public-widget", pattern: "src/widgets/*", partialMatch: false, capture: ["slice"] },
      {
        type: "public-feature",
        pattern: "src/features/*",
        partialMatch: false,
        capture: ["slice"],
      },
      { type: "public-entity", pattern: "src/entities/*", partialMatch: false, capture: ["slice"] },
      {
        type: "public-shared",
        pattern: "src/shared/*/*",
        partialMatch: false,
        capture: ["segment", "slice"],
      },
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
                  type: [
                    "public-page",
                    "public-screen",
                    "public-layout",
                    "public-widget",
                    "public-feature",
                    "public-entity",
                    "public-shared",
                  ],
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
                  type: [
                    "public-layout",
                    "public-widget",
                    "public-feature",
                    "public-entity",
                    "public-shared",
                  ],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "public-layout" } },
            allow: {
              to: {
                element: {
                  type: ["public-widget", "public-feature", "public-entity", "public-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "public-screen" } },
            allow: {
              to: {
                element: {
                  type: ["public-widget", "public-feature", "public-entity", "public-shared"],
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
                  type: ["public-feature", "public-entity", "public-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "public-feature" } },
            allow: {
              to: {
                element: {
                  type: ["public-entity", "public-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "public-entity" } },
            allow: {
              to: {
                element: { type: "public-shared", fileInternalPath: "index.ts" },
              },
            },
          },
        ],
      },
    ],
  },
};
