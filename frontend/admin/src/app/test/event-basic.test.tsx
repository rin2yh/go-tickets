// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { event, renderEventPage } from "./event-page";

function inputValue(element: HTMLElement) {
  if (!(element instanceof HTMLInputElement)) throw new Error("Expected an input element");
  return element.value;
}

describe("イベント基本情報の保存", () => {
  it("保存後にイベントを再取得し、編集中の値を維持する", async () => {
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
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) => input === "/api/admin/events/42"),
      ).toHaveLength(2),
    );
    expect(inputValue(name)).toBe("編集中のイベント名");
  });

  it("再取得失敗時も保存通知と警告を表示し、入力値を維持する", async () => {
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
});
