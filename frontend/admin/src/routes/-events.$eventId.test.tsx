// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

async function renderEventPage() {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/events/42"] }),
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
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
});
