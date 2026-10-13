import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../public/src");
const layerOrder = new Map([
  ["pages", 0],
  ["screens", 0],
  ["widgets", 1],
  ["features", 2],
  ["entities", 3],
  ["shared", 4],
]);

function sliceRoot(path) {
  const parts = path.split("/");
  if (parts[0] === "shared") return parts.slice(0, 3).join("/");
  if (layerOrder.has(parts[0])) return parts.slice(0, 2).join("/");
  return null;
}

function normalizedImportPath(fromPath, specifier) {
  const target = resolve(publicRoot, dirname(fromPath), specifier);
  const path = relative(publicRoot, target).split(sep).join("/");
  return path.replace(/\.(astro|tsx?|jsx?)$/, "").replace(/\/index$/, "");
}

export function checkPublicImport(fromPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const targetPath = normalizedImportPath(fromPath, specifier);
  if (isOutsidePublicRoot(targetPath)) return null;
  const fromParts = fromPath.split("/");
  const toParts = targetPath.split("/");
  const fromLayer = fromParts[0];
  const toLayer = toParts[0];
  if (isLayoutImport(fromLayer, toLayer) || !isPublicLayer(fromLayer) || !isPublicLayer(toLayer))
    return null;

  const fromSlice = sliceRoot(fromPath);
  const toSlice = sliceRoot(targetPath);
  if (isSameSlice(fromSlice, toSlice)) return null;

  const fromLevel = layerOrder.get(fromLayer);
  const toLevel = layerOrder.get(toLayer);
  if (isSameOrHigherLayer(fromLevel, toLevel)) {
    return `${fromPath} must not import ${targetPath}: same-layer and upward imports are forbidden`;
  }
  if (toSlice && targetPath !== toSlice) {
    return `${fromPath} must import ${toSlice} through its index.ts public API`;
  }
  return null;
}

function isOutsidePublicRoot(path) {
  return path === ".." || path.startsWith("../");
}

function isLayoutImport(fromLayer, toLayer) {
  return fromLayer === "pages" && toLayer === "layouts";
}

function isPublicLayer(layer) {
  return layerOrder.has(layer);
}

function isSameSlice(fromSlice, toSlice) {
  return fromSlice !== null && fromSlice === toSlice;
}

function isSameOrHigherLayer(fromLevel, toLevel) {
  return toLevel <= fromLevel;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return files.flat();
}

export async function checkPublicBoundaries() {
  const files = (await sourceFiles(publicRoot)).filter((path) => /\.(astro|tsx?)$/.test(path));
  const errors = [];
  const importPattern =
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const fromPath = relative(publicRoot, file).split(sep).join("/");
    for (const match of source.matchAll(importPattern)) {
      const message = checkPublicImport(fromPath, match[1] ?? match[2]);
      if (message) errors.push(message);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await checkPublicBoundaries();
  if (errors.length > 0) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Public dependency boundaries are valid.\n");
  }
}
