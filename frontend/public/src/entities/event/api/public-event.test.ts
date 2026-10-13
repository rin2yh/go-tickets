import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicEvent, invalidatePublicEvent } from "./public-event";

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
    expect(await first).toEqual(response);
    expect(await second).toEqual(response);
    expect(await fetchPublicEvent(42)).toEqual(response);
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
});
