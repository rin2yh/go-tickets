import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEvent } from "./load-event.ts";

describe("loadEvent", () => {
  it("returns not-found only for a 404 response", async () => {
    const result = await loadEvent(
      "42",
      async () => "token",
      async () => new Response(null, { status: 404 }),
    );

    assert.deepEqual(result, { status: "not-found" });
  });

  it("returns error for other HTTP failures", async () => {
    const result = await loadEvent(
      "42",
      async () => "token",
      async () => new Response(null, { status: 500 }),
    );

    assert.deepEqual(result, { status: "error" });
  });

  it("returns error when the request fails", async () => {
    const result = await loadEvent(
      "42",
      async () => "token",
      async () => {
        throw new TypeError("network unavailable");
      },
    );

    assert.deepEqual(result, { status: "error" });
  });

  it("returns the event for a successful response", async () => {
    const event = { id: 42, name: "Go Conference" };
    const result = await loadEvent(
      "42",
      async () => "token",
      async (input, init) => {
        assert.equal(input, "/api/admin/events/42");
        assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token");
        return Response.json(event);
      },
    );

    assert.deepEqual(result, { status: "success", event });
  });
});
