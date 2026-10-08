import assert from "node:assert/strict";
import test from "node:test";
import { fetchStaticAsset } from "./assets.mjs";

function assetEnv(existing = new Set()) {
  const requestedPaths = [];
  return {
    requestedPaths,
    env: {
      ASSETS: {
        async fetch(request) {
          const path = new URL(request.url).pathname;
          requestedPaths.push(path);
          return existing.has(path)
            ? new Response(`static:${path}`)
            : new Response("Not found", { status: 404 });
        },
      },
    },
  };
}

test("serves generated event pages and returns 404 for missing IDs", async () => {
  const assets = assetEnv(new Set(["/events/1/index.html"]));
  const known = await fetchStaticAsset(new Request("https://tickets.test/events/1"), assets.env);
  assert.equal(known.status, 200);
  assert.match(await known.text(), /events\/1\/index.html/);

  const missing = await fetchStaticAsset(new Request("https://tickets.test/events/999"), assets.env);
  assert.equal(missing.status, 404);
  assert.deepEqual(assets.requestedPaths, ["/events/1/index.html", "/events/999/index.html"]);
});

test("does not route nonnumeric event IDs to a generic page", async () => {
  const assets = assetEnv();
  const response = await fetchStaticAsset(new Request("https://tickets.test/events/not-an-id"), assets.env);
  assert.equal(response.status, 404);
  assert.deepEqual(assets.requestedPaths, []);
});
