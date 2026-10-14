import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Result } from "@praha/byethrow";
import { fetchPublicEvent, fetchPublicEvents } from "./public-event";
import { publicEventKeys, publicEventQueryOptions } from "./public-event-query";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000 } } });
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("public event queries", () => {
  it("uses a distinct key for each event", () => {
    expect(publicEventKeys.detail(42)).not.toEqual(publicEventKeys.detail(43));
  });

  it("leaves request deduplication and caching to TanStack Query", async () => {
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

    expect(await fetchPublicEvent(42)).toEqual(Result.succeed(response));
    expect(await fetchPublicEvent(42)).toEqual(Result.succeed(response));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests for the same event through QueryClient", async () => {
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
    const first = renderHook(() => useQuery(publicEventQueryOptions(42)), { wrapper });
    const second = renderHook(() => useQuery(publicEventQueryOptions(42)), { wrapper });

    await waitFor(() => {
      expect(first.result.current.isSuccess).toBe(true);
      expect(second.result.current.isSuccess).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
