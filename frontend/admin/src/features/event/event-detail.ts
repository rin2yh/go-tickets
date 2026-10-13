import { queryOptions } from "@tanstack/react-query";
import { createContext, useContext } from "react";

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

export async function fetchEvent(eventId: string, getToken: () => Promise<string | null>) {
  const token = await getToken();
  const response = await fetch(`/api/admin/events/${eventId}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (!response.ok) throw new EventRequestError(response.status);
  const event: Event = await response.json();
  return event;
}

export function buildEventQueryOptions(eventId: string, getToken: () => Promise<string | null>) {
  return queryOptions({
    queryKey: ["admin", "events", eventId] as const,
    queryFn: () => fetchEvent(eventId, getToken),
    retry: false,
  });
}

const eventContext = createContext<Event | null>(null);

export const EventProvider = eventContext.Provider;

export function useEvent() {
  const event = useContext(eventContext);
  if (!event) throw new Error("Event context is unavailable");
  return event;
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
