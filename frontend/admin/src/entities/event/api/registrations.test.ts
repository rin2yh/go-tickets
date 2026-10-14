import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { buildRegistrationsQueryOptions } from "./registrations";

const execute = (options: ReturnType<typeof buildRegistrationsQueryOptions>) =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } }).fetchQuery(options);

const query = () =>
  execute(buildRegistrationsQueryOptions("42", "active", "", 1, async () => "token"));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("registration query", () => {
  it("returns a registration page", async () => {
    const page = { items: [], total: 0, active: 0, cancelled: 0, capacity: 10 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(page)),
    );

    await expect(query()).resolves.toEqual(page);
  });

  it("returns a failure for an unsuccessful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await expect(query()).rejects.toThrow("参加者を読み込めません");
  });

  it("surfaces token retrieval failures", async () => {
    const queryWithRejectedToken = buildRegistrationsQueryOptions(
      "42",
      "active",
      "",
      1,
      async () => {
        throw new Error("token unavailable");
      },
    );

    await expect(execute(queryWithRejectedToken)).rejects.toThrow("token unavailable");
  });

  it("surfaces network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));

    await expect(query()).rejects.toThrow("network unavailable");
  });

  it("returns a failure when registration data cannot be decoded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid json")),
    );

    await expect(query()).rejects.toThrow(SyntaxError);
  });
});
