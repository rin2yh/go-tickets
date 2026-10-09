import { useEffect, useState } from "react";
import { ClerkIsland, TicketAvailability } from "./clerk-island";

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

  if (error) return <p role="alert">{error}</p>;
  if (!events) return <p aria-live="polite">イベントを読み込み中です。</p>;
  if (events.length === 0) return <p>現在、公開中のイベントはありません。</p>;

  return (
    <ul>
      {events.map((event) => (
        <li key={event.id}>
          <a href={`/events/${event.id}`}>{event.name}</a>
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
    if (!eventId) {
      setError("イベントが見つかりません。");
      setLoaded(true);
      return;
    }
    void fetch(`/api/events/${eventId}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) throw new Error("イベントが見つかりません。");
        if (!response.ok) throw new Error(`イベントを取得できません (${response.status})`);
        setEvent(await response.json());
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <p aria-live="polite">イベントを読み込み中です。</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!event) return <p role="alert">イベントが見つかりません。</p>;

  return (
    <>
      <h1>{event.name}</h1>
      <h2>チケット</h2>
      {event.ticket_types.length === 0 ? (
        <p>申込可能なチケットはありません。</p>
      ) : (
        <ul>
          {event.ticket_types.map((ticket) => (
            <li key={ticket.id}>
              <strong>{ticket.name}</strong>{" "}
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
