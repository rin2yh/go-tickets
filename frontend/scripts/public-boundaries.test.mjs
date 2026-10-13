import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkPublicBoundaries, checkPublicImport } from "./public-boundaries.mjs";

describe("Public FSD boundaries", () => {
  it("allows downward imports through a slice public API", () => {
    assert.equal(
      checkPublicImport(
        "widgets/public-event-list/ui/list.tsx",
        "../../../features/participant-name",
      ),
      null,
    );
    assert.equal(
      checkPublicImport("features/participant-name/ui/form.tsx", "../../../entities/event"),
      null,
    );
  });

  it("rejects dependencies between slices in the same layer", () => {
    assert.match(
      checkPublicImport(
        "widgets/public-event-list/ui/list.tsx",
        "../../../widgets/public-event-detail",
      ),
      /same-layer and upward imports are forbidden/,
    );
  });

  it("rejects bypassing a slice public API", () => {
    assert.match(
      checkPublicImport(
        "widgets/public-event-list/ui/list.tsx",
        "../../../entities/event/api/public-event",
      ),
      /through its index.ts public API/,
    );
  });

  it("allows imports within the same slice", () => {
    assert.equal(checkPublicImport("widgets/public-event-list/ui/list.tsx", "./card"), null);
  });

  it("checks the imports in the actual Public source tree", async () => {
    assert.deepEqual(await checkPublicBoundaries(), []);
  });

  it("checks Astro layouts and rejects imports into slice internals", () => {
    assert.match(
      checkPublicImport(
        "layouts/site-layout.astro",
        "../widgets/authenticated-area/ui/clerk-island",
      ),
      /through its index.ts public API/,
    );
  });
});
