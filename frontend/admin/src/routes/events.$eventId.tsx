import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, Outlet } from "@tanstack/react-router";
import { createContext, useContext } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";

export interface TicketType {
  id: number;
  name: string;
  capacity: number;
  reserved: number;
  registration_starts_at: string | null;
  registration_ends_at: string | null;
}

export interface Event {
  id: number;
  name: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  publication_status: "draft" | "published";
  ticket_types: TicketType[];
}

export class EventRequestError extends Error {
  constructor(readonly status: number) {
    super(`Event request failed with status ${status}`);
  }
}

export function eventQueryKey(eventId: string) {
  return ["admin", "events", eventId] as const;
}

export async function fetchEvent(eventId: string, getToken: () => Promise<string | null>) {
  const token = await getToken();
  const response = await fetch(`/api/admin/events/${eventId}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (!response.ok) throw new EventRequestError(response.status);
  const event: Event = await response.json();
  return event;
}

export const eventContext = createContext<Event | null>(null);

export function useEvent() {
  const event = useContext(eventContext);
  if (!event) throw new Error("Event context is unavailable");
  return event;
}

export const Route = createFileRoute("/events/$eventId")({
  // oxlint-disable-next-line no-restricted-types
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "tickets" ? ("tickets" as const) : ("basic" as const),
  }),
  component: EventLayout,
});

// oxlint-disable-next-line complexity
function EventLayout() {
  const { eventId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { getToken } = useAuth();
  const eventQuery = useQuery({
    queryKey: eventQueryKey(eventId),
    queryFn: () => fetchEvent(eventId, getToken),
    retry: false,
  });

  if (tab === "tickets") {
    return (
      <Navigate
        to="/events/$eventId/tickets"
        params={{ eventId }}
        search={{ tab: "basic" }}
        replace
      />
    );
  }
  if (eventQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <p aria-live="polite">イベントを読み込み中です。</p>
      </main>
    );
  }
  if (eventQuery.isError && !eventQuery.data) {
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <Alert variant="destructive">
          {eventQuery.error instanceof EventRequestError && eventQuery.error.status === 404
            ? "イベントが見つかりません。"
            : "イベントを読み込めませんでした。"}
        </Alert>
        <p>
          <Link to="/events">イベント一覧へ</Link>
        </p>
      </main>
    );
  }

  const event = eventQuery.data;
  if (!event) return null;
  return (
    <eventContext.Provider value={event}>
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <p className="mb-4 text-sm">
          <Link to="/events">← イベント一覧</Link>
        </p>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {event.name}
              </h1>
              <Badge variant={event.publication_status === "published" ? "default" : "secondary"}>
                {event.publication_status === "published" ? "公開中" : "下書き"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {event.starts_at ? formatJST(event.starts_at) : "開催日時未設定"}
            </p>
          </div>
        </div>
        <nav
          className="mb-7 flex gap-6 overflow-x-auto border-b border-border"
          aria-label="イベント内ナビゲーション"
        >
          <Link
            to="/events/$eventId"
            params={{ eventId }}
            search={{ tab: "basic" }}
            activeOptions={{ exact: true }}
            activeProps={{
              className:
                "shrink-0 border-b-2 border-primary px-1 pb-3 text-sm font-medium text-primary",
            }}
            className="shrink-0 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            基本情報
          </Link>
          <Link
            to="/events/$eventId/tickets"
            params={{ eventId }}
            search={{ tab: "basic" }}
            activeOptions={{ exact: true }}
            activeProps={{
              className:
                "shrink-0 border-b-2 border-primary px-1 pb-3 text-sm font-medium text-primary",
            }}
            className="shrink-0 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            チケット設定
          </Link>
          <Link
            to="/events/$eventId/registrations"
            params={{ eventId }}
            search={{ tab: "basic", status: "active", ticket: "all", page: 1 }}
            activeOptions={{ exact: true }}
            activeProps={{
              className:
                "shrink-0 border-b-2 border-primary px-1 pb-3 text-sm font-medium text-primary",
            }}
            className="shrink-0 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            参加者
          </Link>
        </nav>
        <Outlet key={eventId} />
      </main>
    </eventContext.Provider>
  );
}

export async function saveEventChange(
  getToken: () => Promise<string | null>,
  path: string,
  method: string,
  body: Record<string, string | number | null>,
) {
  const token = await getToken();
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
    body: JSON.stringify(body),
  });
  const result: { error?: string } = await response.json();
  if (!response.ok) throw new Error(saveErrorMessage(result.error));
}

export async function refreshEvent(
  queryClient: QueryClient,
  eventId: string,
  getToken: () => Promise<string | null>,
) {
  try {
    await queryClient.fetchQuery({
      queryKey: eventQueryKey(eventId),
      queryFn: () => fetchEvent(eventId, getToken),
      retry: false,
    });
    return true;
  } catch {
    return false;
  }
}

export function formatJST(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function toLocal(value: string | null) {
  return value
    ? new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16)
    : "";
}

export function toUTC(value: string) {
  return value ? new Date(`${value}+09:00`).toISOString() : null;
}

export function saveErrorMessage(code?: string) {
  const messages: Record<string, string> = {
    forbidden: "管理者権限がありません",
    capacity_below_reserved_or_invalid_event: "申込済み数を下回る定員には変更できません",
    invalid_event_period: "開催終了日時は開始日時より後にしてください",
    invalid_datetime: "日時を正しく入力してください",
    description_required: "公開するイベントには説明が必要です",
    event_datetime_required: "公開するイベントには開催開始・終了日時が必要です",
    invalid_publication_status: "公開状態を選択してください",
    invalid_ticket_type: "チケット名・定員・受付期間を確認してください",
    ticket_registration_period_required: "公開前に各チケットの受付開始・終了日時を設定してください",
    invalid_registration_period: "受付終了日時は受付開始日時より後にしてください",
  };
  return (code && messages[code]) || "保存できませんでした";
}
