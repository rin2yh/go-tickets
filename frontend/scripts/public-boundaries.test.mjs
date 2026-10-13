import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkPublicImport } from "./public-boundaries.mjs";

describe("Public FSD boundaries", () => {
  it("allows downward imports through a slice public API", () => {
    assert.equal(
      checkPublicImport("widgets/public-event-list/ui/list.tsx", "../../../features/auth"),
      null,
    );
    assert.equal(checkPublicImport("features/auth/ui/form.tsx", "../../../entities/event"), null);
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
});
