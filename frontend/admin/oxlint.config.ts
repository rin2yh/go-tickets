import { resolve } from "node:path";
import common from "../oxlint.config.json" with { type: "json" };

const baseImportRule = common.rules["no-restricted-imports"];
const adminImportPatterns = [
  ...(baseImportRule[1].patterns ?? []),
  { group: ["@admin", "@admin/**"], message: "Use a relative path for Admin internal imports." },
];

export default {
  ...common,
  jsPlugins: ["eslint-plugin-boundaries"],
  settings: {
    "boundaries/root-path": resolve(import.meta.dirname),
    "boundaries/include": ["src/**/*.{ts,tsx}"],
    "boundaries/elements": [
      { type: "admin-page", pattern: "src/pages/*", partialMatch: false, capture: ["slice"] },
      { type: "admin-widget", pattern: "src/widgets/*", partialMatch: false, capture: ["slice"] },
      { type: "admin-feature", pattern: "src/features/*", partialMatch: false, capture: ["slice"] },
      { type: "admin-entity", pattern: "src/entities/*", partialMatch: false, capture: ["slice"] },
      {
        type: "admin-shared",
        pattern: "src/shared/*/*",
        partialMatch: false,
        capture: ["segment", "slice"],
      },
      { type: "admin-test", pattern: "src/test", partialMatch: false },
      { type: "admin-app", pattern: "src", partialMatch: false },
    ],
    "boundaries/files": [{ pattern: "src/**/*.test.{ts,tsx}", category: "admin-test" }],
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
    "no-restricted-imports": [
      baseImportRule[0],
      { ...baseImportRule[1], patterns: adminImportPatterns },
    ],
    "boundaries/no-unknown-dependencies": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        policies: [
          {
            from: { element: { type: "admin-app" } },
            allow: {
              to: {
                element: {
                  type: [
                    "admin-page",
                    "admin-widget",
                    "admin-feature",
                    "admin-entity",
                    "admin-shared",
                  ],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { file: { categories: "admin-test" } },
            allow: {
              to: [
                { element: { type: "admin-test" } },
                { element: { type: "admin-app", fileInternalPath: "routeTree.gen.ts" } },
              ],
            },
          },
          {
            from: { element: { type: "admin-test" } },
            allow: {
              to: { element: { type: "admin-app", fileInternalPath: "routeTree.gen.ts" } },
            },
          },
          {
            from: { element: { type: "admin-page" } },
            allow: {
              to: {
                element: {
                  type: ["admin-widget", "admin-feature", "admin-entity", "admin-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "admin-widget" } },
            allow: {
              to: {
                element: {
                  type: ["admin-feature", "admin-entity", "admin-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "admin-feature" } },
            allow: {
              to: {
                element: {
                  type: ["admin-entity", "admin-shared"],
                  fileInternalPath: "index.ts",
                },
              },
            },
          },
          {
            from: { element: { type: "admin-entity" } },
            allow: {
              to: { element: { type: "admin-shared", fileInternalPath: "index.ts" } },
            },
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ["src/entities/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          baseImportRule[0],
          {
            ...baseImportRule[1],
            patterns: adminImportPatterns,
            paths: [
              ...(baseImportRule[1].paths ?? []),
              {
                name: "@clerk/react",
                message: "Entities and Shared must not depend on authentication UI.",
              },
              {
                name: "@tanstack/react-router",
                message: "Entities and Shared must not depend on routing.",
              },
            ],
          },
        ],
      },
    },
  ],
};
