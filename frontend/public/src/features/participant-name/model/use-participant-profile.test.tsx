import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useParticipantProfile } from "./use-participant-profile";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useParticipantProfile", () => {
  it("取得した名前を状態に反映する", async () => {
    const getToken = vi.fn(async () => "token");
    const fetchMock = vi.fn(async () => Response.json({ name: "参加者" }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useParticipantProfile(getToken, true));

    await waitFor(() => expect(result.current.state).toEqual({ status: "loaded", name: "参加者" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/profile", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("トークン取得失敗をエラー状態にする", async () => {
    const getToken = vi.fn(async () => {
      throw new Error("token unavailable");
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useParticipantProfile(getToken, true));

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "failed", error: "token unavailable" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("HTTP エラーをエラー状態にする", async () => {
    const getToken = vi.fn(async () => "token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    const { result } = renderHook(() => useParticipantProfile(getToken, true));

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "failed",
        error: "参加者情報を取得できません (503)",
      }),
    );
  });

  it("JSON の解析失敗をエラー状態にする", async () => {
    const getToken = vi.fn(async () => "token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid json", { status: 200 })),
    );

    const { result } = renderHook(() => useParticipantProfile(getToken, true));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "failed", error: expect.any(String) }),
    );
  });

  it("アンマウント後に完了した取得結果を反映しない", async () => {
    const getToken = vi.fn(async () => "token");
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useParticipantProfile(getToken, true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    unmount();

    await act(async () => resolveFetch(Response.json({ name: "参加者" })));
    expect(result.current.state).toEqual({ status: "loading" });
  });

  it("一時的な失敗後に再試行して復帰する", async () => {
    const getToken = vi.fn(async () => "token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ name: "参加者" }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useParticipantProfile(getToken, true));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.state).toEqual({ status: "loaded", name: "参加者" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
