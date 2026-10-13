import { defineConfig } from "oxlint";
import base from "./.oxlint-base.json" with { type: "json" };

const adminLayers = ["admin-page", "admin-widget", "admin-feature", "admin-entity", "admin-shared"];
const publicLayers = ["public-page", "public-widget", "public-feature", "public-shared"];

function layerPolicies(layers: string[]) {
  const policies = [
    {
      from: { file: { categories: "test" } },
      allow: {
        to: [
          { element: { type: "admin-test", fileInternalPath: "event-page.tsx" } },
          { element: { type: "admin-app", fileInternalPath: "routeTree.gen.ts" } },
        ],
      },
    },
    {
      from: { element: { type: "admin-test" } },
      allow: {
        to: {
          element: { type: "admin-app", fileInternalPath: "routeTree.gen.ts" },
        },
      },
    },
    {
      from: { element: { type: "admin-app" } },
      allow: {
        to: {
          element: {
            type: layers,
            fileInternalPath: "index.ts",
          },
        },
      },
    },
  ];

  for (const [index, layer] of layers.entries()) {
    const downstream = layers.slice(index + 1);
    if (downstream.length === 0) continue;

    policies.push({
      from: { element: { type: layer } },
      allow: {
        to: {
          element: {
            type: downstream,
            fileInternalPath: "index.ts",
          },
        },
      },
    });
  }

  // Each FSD layer is modeled as separate slice elements, so same-layer
  // dependencies remain disallowed by default. Internal files within a slice
  // are ignored by the rule's default `checkInternals: false` behavior.
  return policies;
}

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
  ...base,
  jsPlugins: ["eslint-plugin-boundaries"],
  settings: {
    "boundaries/root-path": ".",
    "boundaries/include": ["admin/src/**/*.{ts,tsx}", "public/src/**/*.{ts,tsx}"],
    "boundaries/elements": [...adminElements, ...publicElements],
    "boundaries/files": [
      { pattern: "admin/src/**/*.test.{ts,tsx}", category: "test" },
      { pattern: "public/src/**/*.test.{ts,tsx}", category: "test" },
    ],
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: ["./admin/tsconfig.json", "./public/tsconfig.json"],
      },
      node: true,
    },
  },
  rules: {
    ...base.rules,
    "boundaries/no-unknown-dependencies": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        policies: [...layerPolicies(adminLayers), ...layerPolicies(publicLayers)],
      },
    ],
  },
});
