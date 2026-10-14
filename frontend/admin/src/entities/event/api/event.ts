import { queryOptions } from "@tanstack/react-query";
import { Result } from "@praha/byethrow";
import type { Event, EventInput, EventSummary } from "../model/event";

export function fetchEvents(getToken: () => Promise<string | null>) {
  return Result.pipe(
    Result.try({
      try: async () => {
        const token = await getToken();
        return fetch("/api/admin/events", {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
      },
      catch: (error) =>
        error instanceof Error ? error : new Error("イベントを読み込めません", { cause: error }),
    }),
    Result.andThen((response) => {
      if (!response.ok) return Result.fail(new Error("イベントを読み込めません"));

      return Result.try({
        try: async () => {
          const events: EventSummary[] = await response.json();
          return events;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("イベントを読み込めません", { cause: error }),
      });
    }),
  );
}

export function buildEventsQueryOptions(getToken: () => Promise<string | null>) {
  return queryOptions({
    queryKey: ["admin", "events"] as const,
    queryFn: async () => Result.unwrap(await fetchEvents(getToken)),
    retry: false,
  });
}

export function createEvent(getToken: () => Promise<string | null>, input: EventInput) {
  return Result.pipe(
    Result.try({
      try: async () => {
        const token = await getToken();
        return fetch("/api/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token ?? ""}`,
          },
          body: JSON.stringify(input),
        });
      },
      catch: (error) =>
        error instanceof Error ? error : new Error("イベントを作成できません", { cause: error }),
    }),
    Result.andThen((response) => {
      const body = Result.try({
        try: async () => {
          const payload: { error?: string; id?: number } = await response.json();
          return payload;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("イベントを作成できません", { cause: error }),
      });

      if (!response.ok) {
        return Result.pipe(
          body,
          Result.orElse(() => Result.succeed({ error: undefined })),
          Result.andThen((payload) => Result.fail(new Error(createErrorMessage(payload.error)))),
        );
      }

      return Result.pipe(
        body,
        Result.andThen((payload) => {
          if (!payload.id) return Result.fail(new Error("イベントを作成できません"));
          return Result.succeed(payload.id);
        }),
      );
    }),
  );
}

function createErrorMessage(code?: string) {
  const messages: Record<string, string> = {
    forbidden: "管理者権限がありません",
    invalid_name: "イベント名は200文字以内で入力してください",
    description_required: "公開するイベントには説明が必要です",
    event_datetime_required: "公開するイベントには開催開始・終了日時が必要です",
    invalid_event_period: "開催終了日時は開始日時より後にしてください",
    invalid_datetime: "日時を正しく入力してください",
  };
  return (code && messages[code]) || "イベントを作成できません";
}

export class EventRequestError extends Error {
  constructor(readonly status: number) {
    super(`Event request failed with status ${status}`);
  }
}

export function fetchEvent(eventId: string, getToken: () => Promise<string | null>) {
  return Result.pipe(
    Result.try({
      try: async () => {
        const token = await getToken();
        return fetch(`/api/admin/events/${eventId}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
      },
      catch: (error) =>
        error instanceof Error ? error : new Error("イベントを読み込めません", { cause: error }),
    }),
    Result.andThen((response) => {
      if (!response.ok) return Result.fail(new EventRequestError(response.status));

      return Result.try({
        try: async () => {
          const event: Event = await response.json();
          return event;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("イベントを読み込めません", { cause: error }),
      });
    }),
  );
}

export function buildEventQueryOptions(eventId: string, getToken: () => Promise<string | null>) {
  return queryOptions({
    queryKey: ["admin", "events", eventId] as const,
    queryFn: async () => Result.unwrap(await fetchEvent(eventId, getToken)),
    retry: false,
  });
}

export function saveEventChange(
  getToken: () => Promise<string | null>,
  path: string,
  method: string,
  body: Record<string, string | number | null>,
) {
  return Result.pipe(
    Result.try({
      try: async () => {
        const token = await getToken();
        return fetch(path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token ?? ""}`,
          },
          body: JSON.stringify(body),
        });
      },
      catch: (error) =>
        error instanceof Error ? error : new Error("保存できませんでした", { cause: error }),
    }),
    Result.andThen((response) => {
      const payload = Result.try({
        try: async () => {
          const result: { error?: string } = await response.json();
          return result;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("保存できませんでした", { cause: error }),
      });

      if (!response.ok) {
        return Result.pipe(
          payload,
          Result.orElse(() => Result.succeed({ error: undefined })),
          Result.andThen((result) => Result.fail(new Error(saveErrorMessage(result.error)))),
        );
      }

      return Result.pipe(
        payload,
        Result.map(() => undefined),
      );
    }),
  );
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
