import { afterEach, describe, expect, it, vi } from "vitest";
import { Result } from "@praha/byethrow";
import { loadRegistrations, refreshRegistrations, submitRegistration } from "./registration";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const registrations = [
  {
    ticket_type_id: 7,
    event_name: "Go Conference",
    ticket_name: "General",
    status: "active" as const,
  },
];

describe("registration API", () => {
  it("loads registrations with the Clerk token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(registrations));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadRegistrations(async () => "token");

    expect(result).toEqual(Result.succeed(registrations));
    expect(fetchMock).toHaveBeenCalledWith("/api/registrations", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("returns token retrieval failures without sending a request", async () => {
    const tokenError = new Error("token unavailable");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadRegistrations(async () => {
      throw tokenError;
    });

    expect(result).toEqual(Result.fail(tokenError));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an empty refresh result when there is no token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshRegistrations(null);

    expect(result).toEqual(Result.succeed(null));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns refresh data and reports HTTP failures as Results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(registrations))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const success = await refreshRegistrations("token");
    const failure = await refreshRegistrations("token");

    expect(success).toEqual(Result.succeed(registrations));
    expect(Result.isFailure(failure)).toBe(true);
    if (Result.isFailure(failure)) expect(failure.error.message).toBe("申込を取得できません (503)");
  });

  it("submits a registration and returns its status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "申込しました" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitRegistration(async () => "token", "register", 7);

    expect(result).toEqual(Result.succeed({ token: "token", status: "申込しました" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/registrations", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket_type_id: 7 }),
    });
  });

  it("keeps the HTTP error when a failed response body is invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid JSON", { status: 500 })),
    );

    const result = await submitRegistration(async () => "token", "register", 7);

    expect(result).toEqual(Result.fail(new Error("500: request_failed")));
  });

  it("returns JSON parsing failures for successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("invalid JSON");
        },
      }),
    );

    const result = await submitRegistration(async () => "token", "register", 7);

    expect(result).toEqual(Result.fail(new SyntaxError("invalid JSON")));
  });
});
