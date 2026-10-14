import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { participantNameQueryOptions } from "./participant-name-query";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("participantNameQueryOptions", () => {
  it("query の成功状態と取得した名前を返す", async () => {
    const getToken = vi.fn(async () => "token");
    const fetchMock = vi.fn(async () => Response.json({ name: "参加者" }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useQuery(participantNameQueryOptions("user_1", getToken)), {
      wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.data).toBe("参加者");
    expect(fetchMock).toHaveBeenCalledWith("/api/profile", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("トークン取得失敗を query の error として返す", async () => {
    const getToken = vi.fn(async () => {
      throw new Error("token unavailable");
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useQuery(participantNameQueryOptions("user_1", getToken)), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("token unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("HTTP エラーを query の error として返す", async () => {
    const getToken = vi.fn(async () => "token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    const { result } = renderHook(() => useQuery(participantNameQueryOptions("user_1", getToken)), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("参加者情報を取得できません (503)");
  });

  it("JSON の解析失敗を query の error として返す", async () => {
    const getToken = vi.fn(async () => "token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid json", { status: 200 })),
    );

    const { result } = renderHook(() => useQuery(participantNameQueryOptions("user_1", getToken)), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("enabled が false の query は pending かつ idle で取得しない", () => {
    const getToken = vi.fn(async () => "token");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () => useQuery({ ...participantNameQueryOptions("", getToken), enabled: false }),
      { wrapper },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("一時的な失敗後に refetch で復帰する", async () => {
    const getToken = vi.fn(async () => "token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ name: "参加者" }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useQuery(participantNameQueryOptions("user_1", getToken)), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("参加者");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ユーザーを切り替えると query key ごとにキャッシュを分ける", async () => {
    const getToken = vi.fn(async () => "token");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      Response.json({ name: new Headers(init?.headers).get("Authorization") }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ userId }) => useQuery(participantNameQueryOptions(userId, getToken)),
      { initialProps: { userId: "user_1" }, wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ userId: "user_2" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBe("Bearer token");
  });
});
