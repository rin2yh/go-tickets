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
            {
              id: 7,
              capacity: 10,
              reserved: 6,
              registration_starts_at: null,
              registration_ends_at: null,
            },
            {
              id: 8,
              capacity: 3,
              reserved: 5,
              registration_starts_at: null,
              registration_ends_at: null,
            },
          ],
        }),
      }),
    );

    render(
      <>
        <TicketAvailability
          eventId={42}
          ticketTypeId={7}
          registrationStartsAt={null}
          registrationEndsAt={null}
          eventEndsAt={null}
        />
        <TicketAvailability
          eventId={42}
          ticketTypeId={8}
          registrationStartsAt={null}
          registrationEndsAt={null}
          eventEndsAt={null}
        />
      </>,
    );

    expect(await screen.findByText("受付前（残席 4）")).toBeTruthy();
    expect(await screen.findByText("満席（残席 0）")).toBeTruthy();
  });

  it("残席を取得できない場合は利用者にエラーを知らせる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    render(
      <TicketAvailability
        eventId={42}
        ticketTypeId={7}
        registrationStartsAt={null}
        registrationEndsAt={null}
        eventEndsAt={null}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toContain("残席を取得できません (503)");
  });
});
