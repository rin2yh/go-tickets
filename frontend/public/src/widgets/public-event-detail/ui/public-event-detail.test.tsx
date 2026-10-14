import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown, PublicEventDetail } from "./public-event-detail";

vi.mock("../../../shared/lib/query", async () => {
  const [{ createElement }, { QueryClient, QueryClientProvider }] = await Promise.all([
    import("react"),
    import("@tanstack/react-query"),
  ]);
  return {
    QueryProvider: ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        children,
      ),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("event description markdown", () => {
  it("does not render raw HTML or unsafe link schemes", () => {
    const markup = '<img src=x onerror="alert(1)">';
    render(<Markdown text={`${markup}\n\n[unsafe](javascript:alert(1))`} />);

    expect(screen.getByText(markup)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("unsafe").closest("a")?.getAttribute("href")).not.toMatch(
      /^javascript:/i,
    );
  });

  it("shows event details, venue, and available tickets", async () => {
    window.history.replaceState({}, "", "/events/381");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: 381,
          name: "Go Conference",
          description: "Welcome **everyone**",
          starts_at: "2026-11-01T01:00:00Z",
          ends_at: "2026-11-01T03:00:00Z",
          venue_name: "Hall A",
          venue_address: "Tokyo & Japan",
          publication_status: "published",
          ticket_types: [
            {
              id: 1,
              name: "一般",
              capacity: 100,
              reserved: 3,
              registration_starts_at: null,
              registration_ends_at: null,
            },
          ],
        }),
      ),
    );

    render(<PublicEventDetail />);

    expect(await screen.findByRole("heading", { name: "Go Conference" })).toBeTruthy();
    expect(screen.getByText("Hall A")).toBeTruthy();
    expect(screen.getByRole("link", { name: "地図を見る" }).getAttribute("href")).toContain(
      "Tokyo%20%26%20Japan",
    );
    expect(screen.getByText("everyone").tagName).toBe("STRONG");
    expect(screen.getByText("一般")).toBeTruthy();
  });

  it("shows an empty state when the URL has no event id", () => {
    window.history.replaceState({}, "", "/events/invalid");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicEventDetail />);

    expect(screen.getByText("イベントが見つかりません。")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a not found message when the event request returns 404", async () => {
    window.history.replaceState({}, "", "/events/382");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    render(<PublicEventDetail />);

    expect(await screen.findByText("イベントが見つかりません。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "再試行" })).toBeTruthy();
  });
});
