import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { EventProvider, EventRequestError, buildEventQueryOptions } from "../../../entities/event";
import { formatJST } from "../../../shared/lib/datetime";

export interface EventLayoutProps {
  eventId: string;
  renderBackLink: (label: string) => ReactNode;
  children: ReactNode;
}

export function EventLayout(props: EventLayoutProps) {
  const { eventId, renderBackLink, children } = props;
  const { getToken } = useAuth();
  const eventQuery = useQuery(buildEventQueryOptions(eventId, getToken));
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
        <p>{renderBackLink("イベント一覧へ")}</p>
      </main>
    );
  }

  const event = eventQuery.data;
  if (!event) return null;
  return (
    <EventProvider value={event}>
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <p className="mb-4 text-sm">{renderBackLink("← イベント一覧")}</p>
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
        {children}
      </main>
    </EventProvider>
  );
}
