import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const cases = [
  ["pages/detail/ui/page.ts", 'export { event } from "../../../entities/event";', true],
  [
    "pages/detail/ui/page.ts",
    'export { event } from "../../../entities/event/model/event";',
    false,
  ],
  ["pages/detail/ui/page.ts", 'export { event } from "../../other";', false],
  ["pages/detail/ui/page.ts", 'export { event } from "../../other/ui/page";', false],
  ["pages/detail/ui/page.ts", 'export { event } from "./form";', true],
  ["pages/detail/ui/page.ts", 'export { event } from "../../../shared/lib/date";', true],
  ["pages/detail/ui/page.ts", 'export { event } from "../../../app/setup";', false],
  ["entities/event/model/event.ts", 'export { event } from "../../../pages/other";', false],
  ["entities/event/model/event.ts", 'export { event } from "../../ticket";', false],
  ["entities/event/model/event.ts", 'export { useAuth } from "@clerk/react";', false],
  ["shared/lib/date/index.ts", 'export { event } from "../../../entities/event";', false],
  ["shared/lib/date/index.ts", 'export { Link } from "@tanstack/react-router";', false],
  ["app/setup.ts", 'export { event } from "../pages/detail";', true],
  ["routes/event.ts", 'export { event } from "../pages/detail";', true],
  ["routes/event.ts", 'export { event } from "../pages/detail/ui/page";', false],
  ["pages/detail/ui/page.ts", 'void import("../../../entities/event/model/event");', false],
  [
    "pages/detail/ui/page.ts",
    'export { event } from "../../../entities/event/../../pages/other";',
    false,
  ],
];

test("Admin layer direction, slice isolation, and public APIs", () => {
  const temporaryRoot = mkdtempSync(join(root, ".admin-architecture-"));
  try {
    copyFileSync(join(root, "oxlint.config.ts"), join(temporaryRoot, "oxlint.config.ts"));
    copyFileSync(join(root, ".oxlint-base.json"), join(temporaryRoot, ".oxlint-base.json"));
    const fixtures = [
      "app/setup.ts",
      "routes/event.ts",
      "pages/detail/index.ts",
      "pages/detail/ui/page.ts",
      "pages/detail/ui/form.ts",
      "pages/other/index.ts",
      "pages/other/ui/page.ts",
      "entities/event/index.ts",
      "entities/event/model/event.ts",
      "entities/ticket/index.ts",
      "shared/lib/date/index.ts",
    ];
    for (const fixture of fixtures) {
      const file = join(temporaryRoot, "admin/src", fixture);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "export const event = 1;\n");
    }
    for (const [source, code, allowed] of cases) {
      const file = join(temporaryRoot, "admin/src", source);
      writeFileSync(file, code);
      const result = spawnSync(join(root, "node_modules/.bin/oxlint"), [`admin/src/${source}`], {
        cwd: temporaryRoot,
        encoding: "utf8",
      });
      assert.equal(result.error, undefined);
      assert.equal(
        result.status,
        allowed ? 0 : 1,
        `${source}: ${code}\n${result.stdout}${result.stderr}`,
      );
      if (!allowed) assert.match(result.stdout + result.stderr, /no-restricted-imports/);
      writeFileSync(file, "export const event = 1;\n");
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
