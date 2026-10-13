// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { event, renderEventPage } from "../../../test/event-page";

const cases = [
  {
    name: "404は見つからない状態を表示する",
    request: async () => new Response(null, { status: 404 }),
    expected: "イベントが見つかりません。",
    unexpected: "イベントを読み込めませんでした。",
  },
  {
    name: "その他のHTTPエラーは読み込み失敗を表示する",
    request: async () => new Response(null, { status: 500 }),
    expected: "イベントを読み込めませんでした。",
    unexpected: "イベントが見つかりません。",
  },
  {
    name: "通信エラーは読み込み失敗を表示する",
    request: async () => {
      throw new TypeError("network unavailable");
    },
    expected: "イベントを読み込めませんでした。",
    unexpected: "イベントが見つかりません。",
  },
  {
    name: "取得成功時はイベント詳細を表示する",
    request: async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("/api/admin/events/42");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token");
      return Response.json(event);
    },
    expected: event.name,
    unexpected: "イベントが見つかりません。",
  },
];

describe("イベント詳細の読み込みと遷移", () => {
  it.each(cases)("$name", async ({ request, expected, unexpected }) => {
    vi.stubGlobal("fetch", vi.fn(request));
    await renderEventPage();
    expect(await screen.findByText(expected)).toBeTruthy();
    expect(screen.queryByText(unexpected)).toBeNull();
  });

  it("取得中は読み込み中の表示を維持する", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response),
    );
    await renderEventPage();
    expect(screen.getByText("イベントを読み込み中です。")).toBeTruthy();
    resolveResponse(new Response(null, { status: 404 }));
    expect(await screen.findByText("イベントが見つかりません。")).toBeTruthy();
  });

  it("イベント切替時に対象イベントの内容を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input === "/api/admin/events/42") return Response.json(event);
        if (input === "/api/admin/events/43")
          return Response.json({ ...event, id: 43, name: "別イベント" });
        throw new Error(`Unexpected request: ${input}`);
      }),
    );
    const router = await renderEventPage();
    await screen.findByLabelText("イベント名");
    await router.navigate({
      to: "/events/$eventId",
      params: { eventId: "43" },
      search: { tab: "basic", status: "active", ticket: "all", page: 1 },
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "別イベント" })).toBeTruthy());
  });

  it("旧チケットURLをチケット設定ルートへリダイレクトする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(event)),
    );
    const router = await renderEventPage(
      "/events/42?tab=tickets&status=cancelled&ticket=vip&page=3",
    );
    expect(await screen.findByRole("heading", { name: "チケット種別" })).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/events/42/tickets"));
    expect(router.state.location.search).toMatchObject({
      status: "cancelled",
      ticket: "vip",
      page: 3,
    });
  });

  it("チケットタブは直接遷移し、参加者フィルターを保つ", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(event)),
    );
    const router = await renderEventPage(
      "/events/42/registrations?status=cancelled&ticket=vip&page=3",
    );
    await screen.findByRole("heading", { name: event.name });

    const ticketsLink = screen.getByRole("link", { name: "チケット設定" });
    expect(ticketsLink.getAttribute("href")).toContain("/events/42/tickets");
    expect(ticketsLink.getAttribute("href")).not.toContain("tab=tickets");
    fireEvent.click(ticketsLink);
    await waitFor(() => expect(router.state.location.pathname).toBe("/events/42/tickets"));
    expect(router.state.location.search).toMatchObject({
      status: "cancelled",
      ticket: "vip",
      page: 3,
    });

    fireEvent.click(screen.getByRole("link", { name: "参加者" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/events/42/registrations"));
    expect(router.state.location.search).toMatchObject({
      status: "cancelled",
      ticket: "vip",
      page: 3,
    });
  });
});
