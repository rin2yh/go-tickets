// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderEventPage } from "../../../test/event-page";

describe("イベント一覧", () => {
  it("取得中の表示を維持する", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response),
    );

    await renderEventPage("/events/");
    expect(screen.getByRole("status").textContent).toContain("イベントを読み込んでいます");

    resolveResponse(Response.json([]));
    expect(await screen.findByText("イベントはまだありません")).toBeTruthy();
  });

  it("取得に失敗した場合はエラーを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    await renderEventPage("/events/");
    expect(await screen.findByText("イベントを読み込めません")).toBeTruthy();
  });

  it("イベントがない場合は空状態を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([])),
    );

    await renderEventPage("/events/");
    expect(await screen.findByText("イベントはまだありません")).toBeTruthy();
  });

  it("イベント一覧を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            id: 42,
            name: "Go Conference",
            starts_at: "2026-11-01T00:00:00Z",
            publication_status: "published",
          },
        ]),
      ),
    );

    await renderEventPage("/events/");
    expect(await screen.findByText("Go Conference")).toBeTruthy();
    expect(screen.getByText("公開中")).toBeTruthy();
  });
});
