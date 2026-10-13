import { readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "oxlint";
import base from "./.oxlint-base.json" with { type: "json" };

const root = fileURLToPath(new URL("./", import.meta.url));
const sourceRoot = resolve(root, "admin/src");
const files = readdirSync(sourceRoot, { recursive: true })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => file.split(sep).join("/"));
const layers = ["app", "pages", "widgets", "features", "entities", "shared"];

function scope(file: string) {
  const [layer, slice, segment] = file.split("/");
  // routes, the generated tree, and main are application composition entries.
  if (layer === "routes" || !file.includes("/")) return { layer: "app", slice: "app" };
  if (layer === "app") return { layer, slice: "app" };
  // Shared has technical segments rather than business slices.
  return { layer, slice: layer === "shared" ? `${slice}/${segment}` : slice };
}

function canImport(source: string, target: string) {
  if (source.endsWith(".test.tsx")) {
    return target === "app/test-page.tsx" || target === "routeTree.gen.ts";
  }
  const from = scope(source);
  const to = scope(target);
  if (from.layer === to.layer && from.slice === to.slice) return true;
  const sourceRank = layers.indexOf(from.layer);
  const targetRank = layers.indexOf(to.layer);
  return sourceRank >= 0 && targetRank > sourceRank && target.endsWith("/index.ts");
}

function importPaths(source: string, target: string) {
  const path = relative(dirname(resolve(sourceRoot, source)), resolve(sourceRoot, target))
    .split(sep)
    .join("/");
  const specifier = path.startsWith(".") ? path : `./${path}`;
  const extensionless = specifier.replace(/\.tsx?$/, "");
  return target.endsWith("/index.ts")
    ? [specifier, extensionless, extensionless.slice(0, -"/index".length)]
    : [specifier, extensionless];
}

const architecture = files.map((file) => {
  const allowed = files
    .filter((target) => canImport(file, target))
    .flatMap((target) => importPaths(file, target));
  const layer = scope(file).layer;
  return {
    files: [`admin/src/${file}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...base.rules["no-restricted-imports"][1].paths,
            ...(layer === "entities" || layer === "shared"
              ? ["@clerk/react", "@tanstack/react-router"]
              : []),
          ],
          patterns: [
            {
              group: ["./**", "../**", "/**", ...allowed.map((path) => `!${path}`)],
              caseSensitive: true,
              message:
                "Admin: import lower layers through index.ts; keep internals within their slice. Use canonical relative paths.",
            },
          ],
        },
      ],
    },
  };
});

export default defineConfig({ ...base, overrides: [...base.overrides, ...architecture] });
