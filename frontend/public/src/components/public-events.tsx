import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { TicketAvailability } from "./clerk-island";
import { fetchPublicEvent, type PublicEvent } from "../lib/public-event";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Card, CardContent } from "@go-tickets/ui/components/card";

export function PublicEventList() {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/events", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`イベントを取得できません (${response.status})`);
        setEvents(await response.json());
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!events)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">イベントを読み込み中です。</p>
        </CardContent>
      </Card>
    );
  if (events.length === 0)
    return (
      <Card>
        <CardContent>
          <p>現在、公開中のイベントはありません。</p>
        </CardContent>
      </Card>
    );

  return (
    <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <li key={event.id}>
          <Card>
            <a className="block h-full p-5 text-inherit no-underline" href={`/events/${event.id}`}>
              <Badge>{event.publication_status === "published" ? "公開中" : ""}</Badge>
              <h2 className="mt-3.5 mb-2 text-lg font-semibold text-foreground">{event.name}</h2>
              <p className="m-0 text-sm text-muted-foreground">イベント詳細とチケットを見る　→</p>
            </a>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function PublicEventDetail() {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const eventId = window.location.pathname.match(/^\/events\/(\d+)\/?$/)?.[1];
    void Promise.resolve()
      .then(() => {
        if (!eventId) throw new Error("イベントが見つかりません。");
        return fetchPublicEvent(Number(eventId));
      })
      .then((item) => {
        setEvent(item);
      })
      .catch((cause: Error) =>
        setError(cause.message.includes("404") ? "イベントが見つかりません。" : cause.message),
      )
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">イベントを読み込み中です。</p>
        </CardContent>
      </Card>
    );
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!event) return <Alert variant="destructive">イベントが見つかりません。</Alert>;

  return (
    <div className="[body.needs-participant-name_&]:hidden">
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
      <section className="mt-8" aria-labelledby="event-description">
        <h2 className="mb-3 text-xl font-semibold text-foreground" id="event-description">
          イベント説明
        </h2>
        <Markdown text={event.description} />
      </section>
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
    </div>
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
