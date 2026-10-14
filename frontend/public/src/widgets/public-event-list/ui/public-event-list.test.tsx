import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicEventList } from "./public-event-list";
import { queryClient } from "../../../shared/lib/query";

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("public event list", () => {
  it("shows an empty state when there are no published events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([])),
    );

    render(<PublicEventList />);

    expect(await screen.findByText("現在、公開中のイベントはありません。")).toBeTruthy();
  });

  it("shows published events with links to their details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            id: 41,
            name: "Go Conference",
            publication_status: "published",
          },
        ]),
      ),
    );

    render(<PublicEventList />);

    expect(await screen.findByRole("heading", { name: "Go Conference" })).toBeTruthy();
    expect(screen.getByText("公開中")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/events/41");
  });

  it("shows a retryable error when loading events fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicEventList />);

    expect(await screen.findByText("イベントを取得できません (503)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("現在、公開中のイベントはありません。")).toBeTruthy();
  });
});
