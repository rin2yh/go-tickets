import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const publicRoot = resolve(dirname(scriptPath), "../public/src");
const publicRequire = createRequire(resolve(dirname(scriptPath), "../public/package.json"));
const ts = publicRequire("typescript");
const configPath = resolve(publicRoot, "../tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const compilerOptions = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  dirname(configPath),
).options;
const layerOrder = new Map([
  ["pages", 0],
  ["screens", 0],
  ["layouts", 0],
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
  const fromFile = resolve(publicRoot, fromPath);
  const resolved = specifier.startsWith(".")
    ? resolve(dirname(fromFile), specifier)
    : ts.resolveModuleName(specifier, fromFile, compilerOptions, ts.sys).resolvedModule
        ?.resolvedFileName;
  if (!resolved) return null;
  const path = relative(publicRoot, resolve(resolved)).split(sep).join("/");
  if (path === ".." || path.startsWith("../")) return null;
  return path.replace(/\.(astro|tsx?|jsx?)$/, "").replace(/\/index$/, "");
}

export function checkPublicImport(fromPath, specifier) {
  const targetPath = normalizedImportPath(fromPath, specifier);
  if (!targetPath) return null;
  const fromParts = fromPath.split("/");
  const toParts = targetPath.split("/");
  const fromLayer = fromParts[0];
  const toLayer = toParts[0];
  if (!layerOrder.has(fromLayer) || !layerOrder.has(toLayer)) return null;
  return checkLayerDependency(fromPath, targetPath, fromLayer, toLayer);
}

function checkLayerDependency(fromPath, targetPath, fromLayer, toLayer) {
  if (fromLayer === "pages" && toLayer === "layouts") return null;
  const fromSlice = sliceRoot(fromPath);
  const toSlice = sliceRoot(targetPath);
  if (fromSlice !== null && fromSlice === toSlice) return null;

  const fromLevel = layerOrder.get(fromLayer);
  const toLevel = layerOrder.get(toLayer);
  if (toLevel <= fromLevel) {
    return `${fromPath} must not import ${targetPath}: same-layer and upward imports are forbidden`;
  }
  if (toSlice && targetPath !== toSlice) {
    return `${fromPath} must import ${toSlice} through its index.ts public API`;
  }
  return null;
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

function astroFrontmatter(source) {
  return source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
}

function moduleSpecifiers(source, filePath) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

export async function checkPublicBoundaries() {
  const files = (await sourceFiles(publicRoot)).filter((path) => /\.(astro|tsx?|jsx?)$/.test(path));
  const errors = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const fromPath = relative(publicRoot, file).split(sep).join("/");
    const code = file.endsWith(".astro") ? astroFrontmatter(source) : source;
    for (const specifier of moduleSpecifiers(code, file)) {
      const message = checkPublicImport(fromPath, specifier);
      if (message) errors.push(message);
    }
  }
  return errors;
}

if (process.argv[1] === scriptPath) {
  const errors = await checkPublicBoundaries();
  if (errors.length > 0) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Public dependency boundaries are valid.\n");
  }
}
