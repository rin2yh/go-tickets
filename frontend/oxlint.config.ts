import { defineConfig } from "oxlint";
import base from "./.oxlint-base.json" with { type: "json" };
const { rules: baseRules, ...baseConfig } = base;

const adminElements = [
  {
    type: "admin-page",
    pattern: "admin/src/pages/*",
    partialMatch: false,
    capture: ["slice"],
  },
  {
    type: "admin-widget",
    pattern: "admin/src/widgets/*",
    partialMatch: false,
    capture: ["slice"],
  },
  {
    type: "admin-feature",
    pattern: "admin/src/features/*",
    partialMatch: false,
    capture: ["slice"],
  },
  {
    type: "admin-entity",
    pattern: "admin/src/entities/*",
    partialMatch: false,
    capture: ["slice"],
  },
  {
    type: "admin-shared",
    pattern: "admin/src/shared/*/*",
    partialMatch: false,
    capture: ["segment", "slice"],
  },
  { type: "admin-test", pattern: "admin/src/test", partialMatch: false },
  { type: "admin-app", pattern: "admin/src", partialMatch: false },
];

const publicElements = [
  {
    type: "public-page",
    pattern: "public/src/pages/*",
    partialMatch: false,
    capture: ["slice"],
  },
  {
    type: "public-widget",
    pattern: "public/src/layouts/*",
    partialMatch: false,
    capture: ["slice"],
  },
  {
    type: "public-feature",
    pattern: "public/src/components",
    partialMatch: false,
  },
  {
    type: "public-shared",
    pattern: "public/src/lib",
    partialMatch: false,
  },
  { type: "public-app", pattern: "public/src", partialMatch: false },
];

export default defineConfig({
  ...baseConfig,
  jsPlugins: ["eslint-plugin-boundaries"],
  settings: {
    "boundaries/root-path": ".",
    "boundaries/include": ["admin/src/**/*.{ts,tsx}", "public/src/**/*.{ts,tsx}"],
    "boundaries/elements": [...adminElements, ...publicElements],
    "boundaries/files": [{ pattern: "admin/src/**/*.test.{ts,tsx}", category: "admin-test" }],
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: ["./admin/tsconfig.json", "./public/tsconfig.json"],
      },
      node: true,
    },
  },
  rules: {
    ...baseRules,
    "boundaries/no-unknown-dependencies": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        policies: [
          // App files can enter slices only through their public API.
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
          // Admin tests may use the shared test renderer and generated route tree.
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
          // FSD dependency direction. `default: disallow` also blocks cross-slice imports
          // within the same layer; files inside one slice are treated as internal.
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
});
