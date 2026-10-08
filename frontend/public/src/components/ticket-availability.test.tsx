import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketAvailability } from "./clerk-island";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("チケットの残席表示", () => {
  it("申込数を差し引いた残席を表示し、満席なら0席と表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ticket_types: [
            { id: 7, capacity: 10, reserved: 6 },
            { id: 8, capacity: 3, reserved: 5 },
          ],
        }),
      }),
    );

    render(
      <>
        <TicketAvailability eventId={42} ticketTypeId={7} />
        <TicketAvailability eventId={42} ticketTypeId={8} />
      </>,
    );

    expect(await screen.findByText("残席 4")).toBeTruthy();
    expect(await screen.findByText("残席 0")).toBeTruthy();
  });

  it("残席を取得できない場合は利用者にエラーを知らせる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    render(<TicketAvailability eventId={42} ticketTypeId={7} />);

    expect((await screen.findByRole("alert")).textContent).toContain("残席を取得できません (503)");
  });
});
