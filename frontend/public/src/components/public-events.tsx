import { useEffect, useState } from "react";
import { ClerkIsland, TicketAvailability } from "./clerk-island";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Card, CardContent } from "@go-tickets/ui/components/card";

interface TicketType {
  id: number;
  name: string;
  capacity: number;
  reserved: number;
}

interface Event {
  id: number;
  name: string;
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
              <Badge>受付中</Badge>
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
        <p>ご希望のチケットを選択してお申し込みください。</p>
      </div>
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
              <TicketAvailability eventId={event.id} ticketTypeId={ticket.id} />
            </li>
          ))}
        </ul>
      )}
      {event.ticket_types.length > 0 && (
        <ClerkIsland
          mode="event"
          eventId={event.id}
          ticketTypes={event.ticket_types.map(({ id, name }) => ({ id, name }))}
        />
      )}
    </>
  );
}
