import { afterEach, describe, expect, it, vi } from "vitest";
import { Result } from "@praha/byethrow";
import { createEvent, fetchEvents, fetchEvent, EventRequestError, saveEventChange } from "./event";

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

  it("uses a generic message for an unknown create validation error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "unknown" }, { status: 400 })),
    );

    const result = await createEvent(async () => null, {
      name: "Event",
      description: "",
      starts_at: null,
      ends_at: null,
      venue_name: null,
      venue_address: null,
      publication_status: "draft",
    });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error.message).toBe("イベントを作成できません");
  });

  it("requires an id in a successful create response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));

    const result = await createEvent(async () => null, {
      name: "Event",
      description: "",
      starts_at: null,
      ends_at: null,
      venue_name: null,
      venue_address: null,
      publication_status: "draft",
    });

    expect(Result.isFailure(result)).toBe(true);
  });

  it("returns network failures as Result failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));

    const result = await fetchEvents(async () => "token");

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error.message).toBe("network unavailable");
  });

  it("returns an HTTP failure when loading the event list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const result = await fetchEvents(async () => null);

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error.message).toBe("イベントを読み込めません");
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

  it("maps event update validation errors to a user-facing message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "invalid_event_period" }, { status: 400 })),
    );

    const result = await saveEventChange(async () => "token", "/api/events/42", "PUT", {
      name: "Event",
    });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result))
      expect(result.error.message).toBe("開催終了日時は開始日時より後にしてください");
  });

  it("reports unrecognized validation errors with the generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "unknown" }, { status: 400 })),
    );

    const result = await saveEventChange(async () => null, "/api/events/42", "PUT", {});

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.error.message).toBe("保存できませんでした");
  });

  it("returns a failure when a successful event update has invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid json")));

    const result = await saveEventChange(async () => "token", "/api/events/42", "PUT", {});

    expect(Result.isFailure(result)).toBe(true);
  });
});
