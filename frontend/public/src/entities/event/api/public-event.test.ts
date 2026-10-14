import { afterEach, describe, expect, it, vi } from "vitest";
import { Result } from "@praha/byethrow";
import { fetchPublicEvent, fetchPublicEvents, invalidatePublicEvent } from "./public-event";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  invalidatePublicEvent(42);
});

describe("public event fetch cache", () => {
  it("shares an in-flight request and reuses its result briefly", async () => {
    const response = {
      id: 42,
      name: "Go Conference",
      description: "Details",
      starts_at: null,
      ends_at: null,
      venue_name: null,
      venue_address: null,
      publication_status: "published" as const,
      ticket_types: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchPublicEvent(42);
    const second = fetchPublicEvent(42);
    expect(await first).toEqual(Result.succeed(response));
    expect(await second).toEqual(Result.succeed(response));
    expect(await fetchPublicEvent(42)).toEqual(Result.succeed(response));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expires cached data", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 42,
        name: "Go Conference",
        description: "Details",
        starts_at: null,
        ends_at: null,
        venue_name: null,
        venue_address: null,
        publication_status: "published",
        ticket_types: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPublicEvent(42);
    await vi.advanceTimersByTimeAsync(15_001);
    await fetchPublicEvent(42);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a failure for HTTP errors and retries instead of caching it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 42, name: "Recovered" }) });
    vi.stubGlobal("fetch", fetchMock);

    const failure = await fetchPublicEvent(42);
    expect(Result.isFailure(failure)).toBe(true);
    if (Result.isFailure(failure)) expect(failure.error.message).toContain("404");

    const recovered = await fetchPublicEvent(42);
    expect(Result.isSuccess(recovered)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns network failures as Result failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));

    const result = await fetchPublicEvent(42);

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error.message).toBe("network unavailable");
  });

  it("returns JSON parsing failures as Result failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("invalid JSON");
        },
      }),
    );

    const result = await fetchPublicEvent(42);

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error.message).toBe("invalid JSON");
  });

  it("returns an HTTP failure when the public event list cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const result = await fetchPublicEvents();

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error.message).toContain("503");
  });
});
