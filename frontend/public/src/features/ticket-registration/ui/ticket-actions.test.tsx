import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicEventQueryOptions } from "../../../entities/event";
import { RegisterButtons, TicketActions, TicketAvailability } from "./ticket-actions";

const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ getToken: getTokenMock, userId: "user_1" }),
  UserButton: () => null,
}));

function EventQueryObserver() {
  const query = useQuery(publicEventQueryOptions(42));
  return <span>{query.data?.name}</span>;
}

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

  it("キャンセル後の履歴再取得に失敗しても古い申込を操作できず、再試行で同期する", async () => {
    getTokenMock.mockResolvedValue("token");
    let historyRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/registrations" && !init?.method) {
        historyRequests += 1;
        if (historyRequests === 1) {
          return Response.json([
            {
              ticket_type_id: 7,
              event_name: "Event",
              ticket_name: "General",
              status: "active",
            },
          ]);
        }
        if (historyRequests === 2) throw new TypeError("refresh unavailable");
        return Response.json([
          {
            ticket_type_id: 7,
            event_name: "Event",
            ticket_name: "General",
            status: "cancelled",
          },
        ]);
      }
      if (input === "/api/registrations/cancel" && init?.method === "POST") {
        return Response.json({ status: "キャンセルしました" });
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TicketActions
          mode="tickets"
          eventId={42}
          ticketTypes={[]}
          eventEndsAt={null}
          participantName="Participant"
          onEditName={() => {}}
        />
      </QueryClientProvider>,
    );

    const cancelButton = await screen.findByRole("button", { name: "キャンセル" });
    fireEvent.click(cancelButton);

    expect(await screen.findByText("refresh unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "キャンセル" })).toBeNull();
    expect(screen.queryByText("Event / General")).toBeNull();
    expect(
      screen.getByText("キャンセルしました。状態を更新できませんでした。再試行してください。"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("キャンセル済み")).toBeTruthy();
    expect(screen.queryByText("状態を更新できませんでした")).toBeNull();
    expect(historyRequests).toBe(3);
  });

  it("履歴の初回取得に失敗したとき空一覧を出さず、再試行後に空状態を表示する", async () => {
    getTokenMock.mockResolvedValue("token");
    let historyRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/registrations") {
        historyRequests += 1;
        if (historyRequests === 1) throw new TypeError("history unavailable");
        return Response.json([]);
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TicketActions
          mode="tickets"
          eventId={42}
          ticketTypes={[]}
          eventEndsAt={null}
          participantName="Participant"
          onEditName={() => {}}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("history unavailable")).toBeTruthy();
    expect(screen.queryByText("申込済みのチケットはありません。")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("申込済みのチケットはありません。")).toBeTruthy();
    expect(historyRequests).toBe(2);
  });

  it("イベント詳細の再取得だけ失敗した場合も、再試行で両方の状態を同期する", async () => {
    const now = Date.now();
    const startsAt = new Date(now - 60_000).toISOString();
    const endsAt = new Date(now + 60_000).toISOString();
    const eventEndsAt = new Date(now + 120_000).toISOString();
    getTokenMock.mockResolvedValue("token");
    let historyRequests = 0;
    let eventRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/registrations" && !init?.method) {
        historyRequests += 1;
        return Response.json([]);
      }
      if (input === "/api/registrations" && init?.method === "POST") {
        return Response.json({ status: "申込しました" });
      }
      if (input === "/api/events/42") {
        eventRequests += 1;
        if (eventRequests === 2) throw new TypeError("event refresh unavailable");
        return Response.json({
          id: 42,
          name: eventRequests === 1 ? "Event" : "Event refreshed",
          description: "",
          starts_at: null,
          ends_at: null,
          venue_name: null,
          venue_address: null,
          publication_status: "published",
          ticket_types: [],
        });
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <EventQueryObserver />
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
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Event")).toBeTruthy();
    const registerButton = await screen.findByRole("button", { name: "Generalに申込" });
    await waitFor(() => expect(registerButton.hasAttribute("disabled")).toBe(false));
    expect(registerButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(registerButton);

    expect(await screen.findByText(/状態を更新できませんでした/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "再試行" })).toBeTruthy();
    expect(historyRequests).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("Event refreshed")).toBeTruthy();
    expect(screen.queryByText(/状態を更新できませんでした/)).toBeNull();
    expect(historyRequests).toBe(3);
    expect(eventRequests).toBe(3);
  });
});
