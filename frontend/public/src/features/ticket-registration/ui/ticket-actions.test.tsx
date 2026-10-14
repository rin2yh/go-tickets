import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegisterButtons, TicketActions, TicketAvailability } from "./ticket-actions";

const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
  UserButton: () => null,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("受付状態", () => {
  it("初回レンダーで時刻未確定の状態を受付前と誤判定しない", () => {
    const markup = renderToStaticMarkup(
      <TicketAvailability
        registrationStartsAt="2027-12-31T00:00:00Z"
        registrationEndsAt="2028-01-02T00:00:00Z"
        eventEndsAt="2028-01-03T00:00:00Z"
        capacity={10}
        reserved={6}
      />,
    );

    expect(markup).toContain("受付状態を確認中…（残席 4）");
  });

  it("受付中と満席をチケット情報から表示する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-01-01T00:00:00Z"));

    render(
      <>
        <TicketAvailability
          registrationStartsAt="2027-12-31T00:00:00Z"
          registrationEndsAt="2028-01-02T00:00:00Z"
          eventEndsAt="2028-01-03T00:00:00Z"
          capacity={10}
          reserved={6}
        />
        <TicketAvailability
          registrationStartsAt="2027-12-31T00:00:00Z"
          registrationEndsAt="2028-01-02T00:00:00Z"
          eventEndsAt="2028-01-03T00:00:00Z"
          capacity={3}
          reserved={3}
        />
      </>,
    );

    expect(screen.getByText("受付中（残席 4）")).toBeTruthy();
    expect(screen.getByText("満席（残席 0）")).toBeTruthy();
  });

  it("申込履歴を取得し終えるまで申込ボタンを無効にする", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-01-01T00:00:00Z"));

    render(
      <RegisterButtons
        tickets={[
          {
            id: 7,
            name: "General",
            capacity: 10,
            reserved: 0,
            registration_starts_at: "2027-12-31T00:00:00Z",
            registration_ends_at: "2028-01-02T00:00:00Z",
          },
        ]}
        eventEndsAt="2028-01-03T00:00:00Z"
        registrations={[]}
        registrationsReady={false}
        busy={false}
        register={async () => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Generalに申込" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("申込成功後の履歴再取得失敗を申込失敗と区別して表示する", async () => {
    const now = Date.now();
    const startsAt = new Date(now - 60_000).toISOString();
    const endsAt = new Date(now + 60_000).toISOString();
    const eventEndsAt = new Date(now + 120_000).toISOString();
    getTokenMock.mockResolvedValue("token");
    let historyRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/registrations" && !init?.method) {
        historyRequests += 1;
        if (historyRequests === 1) return Response.json([]);
        throw new TypeError("refresh unavailable");
      }
      if (input === "/api/registrations" && init?.method === "POST") {
        return Response.json({ status: "申込しました" });
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TicketActions
        mode="event"
        eventId={42}
        ticketTypes={[
          {
            id: 7,
            name: "General",
            capacity: 10,
            reserved: 0,
            registration_starts_at: startsAt,
            registration_ends_at: endsAt,
          },
        ]}
        eventEndsAt={eventEndsAt}
        participantName="Participant"
        onEditName={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Generalに申込" }));

    expect(
      await screen.findByText("申込は完了しましたが、申込状態の再取得に失敗しました。"),
    ).toBeTruthy();
    expect(screen.queryByText("通信に失敗しました")).toBeNull();
  });
});
