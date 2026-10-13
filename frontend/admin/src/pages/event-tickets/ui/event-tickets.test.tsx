// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { event, renderEventPage } from "../../../test/event-page";

function inputValue(element: HTMLElement) {
  if (!(element instanceof HTMLInputElement)) throw new Error("Expected an input element");
  return element.value;
}

describe("チケット設定の保存", () => {
  it("保存後にイベントを一度再取得し、編集中の値を維持する", async () => {
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
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) => input === "/api/admin/events/42"),
      ).toHaveLength(2),
    );
    expect(inputValue(name)).toBe("編集中のチケット名");
  });
});
