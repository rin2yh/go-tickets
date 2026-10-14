import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { TicketAvailability } from "../../../features/ticket-registration";
import { type PublicEvent, publicEventQueryOptions } from "../../../entities/event";
import { QueryProvider } from "../../../shared/lib/query";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Card, CardContent } from "@go-tickets/ui/components/card";

export function PublicEventDetail() {
  return (
    <QueryProvider>
      <PublicEventDetailContent />
    </QueryProvider>
  );
}

function PublicEventDetailContent() {
  const eventId = Number(window.location.pathname.match(/^\/events\/(\d+)\/?$/)?.[1] ?? 0);
  const {
    data: event,
    error,
    isPending,
    refetch,
    isFetching,
  } = useQuery({
    ...publicEventQueryOptions(eventId),
    enabled: eventId > 0,
  });
  const status = eventQueryStatus(eventId, isPending, error, isFetching, () => void refetch());
  if (status) return status;
  if (!event) return null;

  return (
    <div>
      <EventHeading event={event} />
      <EventVenue event={event} />
      <section className="mt-8" aria-labelledby="event-description">
        <h2 className="mb-3 text-xl font-semibold text-foreground" id="event-description">
          イベント説明
        </h2>
        <Markdown text={event.description} />
      </section>
      <EventTickets event={event} />
    </div>
  );
}

function eventQueryStatus(
  eventId: number,
  isPending: boolean,
  error: Error | null,
  isFetching: boolean,
  retry: () => void,
): ReactNode {
  if (!eventId) return <Alert variant="destructive">イベントが見つかりません。</Alert>;
  if (isPending)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">イベントを読み込み中です。</p>
        </CardContent>
      </Card>
    );
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <p>{error.message.includes("404") ? "イベントが見つかりません。" : error.message}</p>
      <button type="button" disabled={isFetching} onClick={retry}>
        再試行
      </button>
    </Alert>
  );
}

function formatJST(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function Markdown({ text }: { text: string }) {
  return <ReactMarkdown>{text}</ReactMarkdown>;
}

function EventHeading({ event }: { event: PublicEvent }) {
  return (
    <div className="mb-7">
      <Badge>イベント詳細</Badge>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        {event.name}
      </h1>
      <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
        {event.starts_at && event.ends_at
          ? `${formatJST(event.starts_at)} – ${formatJST(event.ends_at)}`
          : ""}
      </p>
    </div>
  );
}

function EventVenue({ event }: { event: PublicEvent }) {
  return (
    <>
      {event.venue_name && (
        <h2 className="mb-3 text-xl font-semibold text-foreground">{event.venue_name}</h2>
      )}
      {event.venue_address && (
        <p className="mb-6">
          {event.venue_address}{" "}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue_address)}`}
            target="_blank"
            rel="noreferrer"
          >
            地図を見る
          </a>
        </p>
      )}
    </>
  );
}

function EventTickets({ event }: { event: PublicEvent }) {
  return (
    <>
      <h2 className="mt-8 mb-4 text-xl font-semibold text-foreground">チケット</h2>
      {event.ticket_types.length === 0 ? (
        <Card>
          <CardContent>
            <p>申込可能なチケットはありません。</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid list-none gap-3 p-0">
          {event.ticket_types.map((ticket) => (
            <li
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
              key={ticket.id}
            >
              <strong className="min-w-0 break-words">{ticket.name}</strong>
              <TicketAvailability
                registrationStartsAt={ticket.registration_starts_at}
                registrationEndsAt={ticket.registration_ends_at}
                eventEndsAt={event.ends_at}
                capacity={ticket.capacity}
                reserved={ticket.reserved}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
