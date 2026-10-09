import { useEffect, useState } from "react";
import { TicketAvailability } from "./clerk-island";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Card, CardContent } from "@go-tickets/ui/components/card";

interface TicketType {
  id: number;
  name: string;
  capacity: number;
  reserved: number;
  registration_starts_at: string | null;
  registration_ends_at: string | null;
}

interface Event {
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

export function PublicEventList() {
  const [events, setEvents] = useState<Event[] | null>(null);
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
    <ul className="public-event-list">
      {events.map((event) => (
        <li key={event.id}>
          <Card>
            <a className="public-event-card" href={`/events/${event.id}`}>
              <Badge>{event.publication_status === "published" ? "公開中" : ""}</Badge>
              <h2>{event.name}</h2>
              <p>イベント詳細とチケットを見る　→</p>
            </a>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function PublicEventDetail() {
  const [event, setEvent] = useState<Event | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const eventId = window.location.pathname.match(/^\/events\/(\d+)\/?$/)?.[1];
    void Promise.resolve()
      .then(() => {
        if (!eventId) throw new Error("イベントが見つかりません。");
        return fetch(`/api/events/${eventId}`, { cache: "no-store" });
      })
      .then(async (response) => {
        if (response.status === 404) throw new Error("イベントが見つかりません。");
        if (!response.ok) throw new Error(`イベントを取得できません (${response.status})`);
        setEvent(await response.json());
      })
      .catch((cause: Error) => setError(cause.message))
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
    <>
      <div className="public-hero">
        <Badge>イベント詳細</Badge>
        <h1 style={{ marginTop: 12 }}>{event.name}</h1>
        <p>
          {event.starts_at && event.ends_at
            ? `${formatJST(event.starts_at)} – ${formatJST(event.ends_at)}`
            : ""}
        </p>
      </div>
      {event.venue_name && <h2>{event.venue_name}</h2>}
      {event.venue_address && (
        <p>
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
      <section aria-labelledby="event-description">
        <h2 id="event-description">イベント説明</h2>
        <Markdown text={event.description} />
      </section>
      <h2>チケット</h2>
      {event.ticket_types.length === 0 ? (
        <Card>
          <CardContent>
            <p>申込可能なチケットはありません。</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="public-ticket-list">
          {event.ticket_types.map((ticket) => (
            <li className="public-ticket-row" key={ticket.id}>
              <strong>{ticket.name}</strong>
              <TicketAvailability
                eventId={event.id}
                ticketTypeId={ticket.id}
                registrationStartsAt={ticket.registration_starts_at}
                registrationEndsAt={ticket.registration_ends_at}
                eventEndsAt={event.ends_at}
              />
            </li>
          ))}
        </ul>
      )}
    </>
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
  const blocks = text.split(/\n\s*\n/).filter(Boolean);
  return (
    <div>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        const heading = lines[0].match(/^(#{1,3})\s+(.+)$/);
        if (heading && heading[1].length === 1)
          return <h2 key={index}>{inlineMarkdown(heading[2])}</h2>;
        if (heading && heading[1].length === 2)
          return <h3 key={index}>{inlineMarkdown(heading[2])}</h3>;
        if (heading) return <h4 key={index}>{inlineMarkdown(heading[2])}</h4>;
        if (lines.every((line) => /^[-*]\s/.test(line)))
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inlineMarkdown(line.replace(/^[-*]\s/, ""))}</li>
              ))}
            </ul>
          );
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {inlineMarkdown(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inlineMarkdown(value: string) {
  const parts = value.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link)
      return (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}
