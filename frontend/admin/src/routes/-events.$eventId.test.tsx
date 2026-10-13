// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import type * as Clerk from "@clerk/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "../routeTree.gen";

const auth = vi.hoisted(() => ({ getToken: vi.fn(async () => "token") }));

vi.mock("@clerk/react", async (importOriginal) => {
  const actual = await importOriginal<typeof Clerk>();
  return {
    ...actual,
    useAuth: () => ({ getToken: auth.getToken, isLoaded: true, isSignedIn: true }),
    UserButton: () => null,
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const event = {
  id: 42,
  name: "Go Conference",
  description: "Conference description",
  starts_at: null,
  ends_at: null,
  venue_name: null,
  venue_address: null,
  publication_status: "draft",
  ticket_types: [],
};

function inputValue(element: HTMLElement) {
  if (!(element instanceof HTMLInputElement)) throw new Error("Expected an input element");
  return element.value;
}

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

async function renderEventPage(initialEntry = "/events/42") {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("イベント詳細の読み込み状態", () => {
  it.each(cases)("$name", async ({ request, expected, unexpected }) => {
    const fetchMock = vi.fn(request);
    vi.stubGlobal("fetch", fetchMock);
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

  it("保存後のイベント再取得は1回だけで、編集中の値を維持する", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/admin/events/42") return Response.json(event);
      if (input === "/api/events/42") return Response.json({});
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await renderEventPage();

    const name = await screen.findByLabelText("イベント名");
    fireEvent.change(name, { target: { value: "編集中のイベント名" } });
    fireEvent.click(screen.getByRole("button", { name: "イベントを保存" }));

    expect((await screen.findByRole("status")).textContent).toContain("変更を保存しました。");
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => input === "/api/admin/events/42"),
      ).toHaveLength(2);
    });
    expect(inputValue(name)).toBe("編集中のイベント名");
  });

  it("再取得失敗でも保存成功通知と警告を表示し、入力値を維持する", async () => {
    let detailRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/admin/events/42") {
        detailRequests += 1;
        return detailRequests === 1 ? Response.json(event) : new Response(null, { status: 500 });
      }
      if (input === "/api/events/42") return Response.json({});
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await renderEventPage();

    const name = await screen.findByLabelText("イベント名");
    fireEvent.change(name, { target: { value: "保存後の入力値" } });
    fireEvent.click(screen.getByRole("button", { name: "イベントを保存" }));

    expect((await screen.findByRole("status")).textContent).toContain("変更を保存しました。");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "変更は保存されましたが、最新情報を再取得できませんでした。",
    );
    expect(screen.queryByText("保存できませんでした")).toBeNull();
    expect(inputValue(name)).toBe("保存後の入力値");
    expect(detailRequests).toBe(2);
  });

  it("チケット保存後もイベント再取得は1回でフォーム値を維持する", async () => {
    const eventWithTicket = {
      ...event,
      ticket_types: [
        {
          id: 9,
          name: "一般",
          capacity: 100,
          reserved: 3,
          registration_starts_at: null,
          registration_ends_at: null,
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/admin/events/42") return Response.json(eventWithTicket);
      if (input === "/api/ticket-types/9") return Response.json({});
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await renderEventPage("/events/42/tickets");

    const name = await screen.findByLabelText("種別名", { selector: "#ticket-name-9" });
    fireEvent.change(name, { target: { value: "編集中のチケット名" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect((await screen.findByRole("status")).textContent).toContain("変更を保存しました。");
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => input === "/api/admin/events/42"),
      ).toHaveLength(2);
    });
    expect(inputValue(name)).toBe("編集中のチケット名");
  });

  it("イベントを切り替えるとフォームを切り替え先の内容で初期化する", async () => {
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
    const name = await screen.findByLabelText("イベント名");
    fireEvent.change(name, { target: { value: "編集中" } });

    await router.navigate({
      to: "/events/$eventId",
      params: { eventId: "43" },
      search: { tab: "basic" },
    });

    await waitFor(() => expect(inputValue(screen.getByLabelText("イベント名"))).toBe("別イベント"));
  });

  it("旧チケットURLをチケット設定ルートへリダイレクトする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(event)),
    );
    const router = await renderEventPage("/events/42?tab=tickets");

    expect(await screen.findByRole("heading", { name: "チケット種別" })).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/events/42/tickets"));
  });
});
