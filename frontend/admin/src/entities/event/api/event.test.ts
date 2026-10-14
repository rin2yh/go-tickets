import { afterEach, describe, expect, it, vi } from "vitest";
import { Result } from "@praha/byethrow";
import { createEvent, fetchEvents, fetchEvent, EventRequestError } from "./event";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("event API results", () => {
  it("returns the created event id on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: 42 })));

    const result = await createEvent(async () => "token", {
      name: "Event",
      description: "Description",
      starts_at: null,
      ends_at: null,
      venue_name: null,
      venue_address: null,
      publication_status: "draft",
    });

    expect(result).toEqual(Result.succeed(42));
  });

  it("returns validation failures without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "invalid_name" }, { status: 400 })),
    );

    const result = await createEvent(async () => "token", {
      name: "",
      description: "",
      starts_at: null,
      ends_at: null,
      venue_name: null,
      venue_address: null,
      publication_status: "draft",
    });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result))
      expect(result.error.message).toBe("イベント名は200文字以内で入力してください");
  });

  it("returns network failures as Result failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));

    const result = await fetchEvents(async () => "token");

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error.message).toBe("network unavailable");
  });

  it("preserves HTTP status for event query errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const result = await fetchEvent("42", async () => "token");

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error).toBeInstanceOf(EventRequestError);
    if (Result.isFailure(result) && result.error instanceof EventRequestError) {
      expect(result.error.status).toBe(404);
    }
  });
});
