import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function lintFixture(app: "admin" | "public", source: string) {
  const sourceDirectory =
    app === "admin" ? "admin/src/pages/event-detail/ui" : "public/src/components";
  const fixtureDirectory = mkdtempSync(join(frontendRoot, sourceDirectory, "boundaries-"));
  fixtures.push(fixtureDirectory);
  const fixture = join(fixtureDirectory, "fixture.tsx");
  writeFileSync(fixture, source);

  try {
    execFileSync(
      join(frontendRoot, "node_modules/.bin/oxlint"),
      [relative(frontendRoot, fixture)],
      {
        cwd: frontendRoot,
        encoding: "utf8",
      },
    );
    return "";
  } catch (error) {
    if (!(error instanceof Error) || !("stdout" in error)) throw error;
    return String(error.stdout);
  }
}

describe("Oxlint architecture boundaries", () => {
  it("resolves an Admin tsconfig alias and allows a downward import through a slice API", () => {
    const output = lintFixture(
      "admin",
      'import "@admin/entities/event";\nimport "@admin/shared/lib/datetime";\n',
    );

    expect(output).toBe("");
  });

  it("rejects an Admin dependency between page slices", () => {
    const output = lintFixture("admin", 'import "@admin/pages/home";\n');

    expect(output).toMatch(/There is no policy allowing dependencies/);
  });

  it("rejects an Admin import that bypasses an entity public API", () => {
    const output = lintFixture("admin", 'import "@admin/entities/event/model/event";\n');

    expect(output).toMatch(/There is no policy allowing dependencies/);
  });

  it("resolves a Public tsconfig alias and allows a feature to use shared", () => {
    const output = lintFixture("public", 'import "@public/lib";\n');

    expect(output).toBe("");
  });

  it("rejects a Public component import that bypasses the shared public API", () => {
    const output = lintFixture("public", 'import "@public/lib/public-event";\n');

    expect(output).toMatch(/There is no policy allowing dependencies/);
  });
});
