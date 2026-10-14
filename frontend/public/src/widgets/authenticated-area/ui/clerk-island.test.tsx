import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ClerkIsland } from "./clerk-island";

const { authState, userState } = vi.hoisted(() => ({
  authState: vi.fn(),
  userState: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignIn: () => <div>サインイン</div>,
  useAuth: authState,
  useUser: userState,
}));

vi.mock("../../../features/ticket-registration", () => ({
  TicketActions: ({ mode, eventId }: { mode: string; eventId: number }) => (
    <div>{`${mode}:${eventId}`}</div>
  ),
}));

beforeEach(() => {
  window.history.replaceState({}, "", "/tickets");
  authState.mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    getToken: vi.fn(async () => "token"),
  });
  userState.mockReturnValue({ user: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ publishableKey: "pk_test" })),
  );
  vi.spyOn(document, "addEventListener");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ClerkIsland", () => {
  it("一つのページ遷移購読で認証画面のルートを更新する", async () => {
    render(<ClerkIsland />);

    expect(await screen.findByText("サインイン")).toBeTruthy();
    const pageLoadSubscriptions = vi
      .mocked(document.addEventListener)
      .mock.calls.filter(([eventName]) => eventName === "astro:page-load");
    expect(pageLoadSubscriptions).toHaveLength(1);
    expect(pageLoadSubscriptions[0]?.[1]).toEqual(expect.any(Function));

    window.history.replaceState({}, "", "/events/42");
    document.dispatchEvent(new Event("astro:page-load"));
    expect(screen.getByText("サインイン")).toBeTruthy();
  });

  it("プロフィール取得失敗を名前未設定と扱わずエラー表示する", async () => {
    authState.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      getToken: vi.fn(async () => "token"),
    });
    let profileRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input === "/api/auth/config") return Response.json({ publishableKey: "pk_test" });
        if (input === "/api/profile" && profileRequests++ === 0)
          return new Response(null, { status: 503 });
        return Response.json({ name: "参加者" });
      }),
    );

    render(<ClerkIsland />);

    expect(await screen.findByText("参加者情報を取得できません (503)")).toBeTruthy();
    expect(screen.queryByText("参加者名フォーム")).toBeNull();
    screen.getByRole("button", { name: "もう一度試す" }).click();
    expect(await screen.findByText("tickets:0")).toBeTruthy();
  });

  it("イベント申込情報の取得失敗を表示する", async () => {
    authState.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      getToken: vi.fn(async () => "token"),
    });
    window.history.replaceState({}, "", "/events/42");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input === "/api/auth/config") return Response.json({ publishableKey: "pk_test" });
        if (input === "/api/profile") return Response.json({ name: "参加者" });
        if (input === "/api/events/42") return new Response(null, { status: 503 });
        throw new Error(`Unexpected request: ${input}`);
      }),
    );

    render(<ClerkIsland />);

    await waitFor(() => expect(screen.getByText("イベントを取得できません (503)")).toBeTruthy());
  });
});
