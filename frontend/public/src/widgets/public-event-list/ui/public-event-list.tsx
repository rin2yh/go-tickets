import { useEffect, useState } from "react";
import { Result } from "@praha/byethrow";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { fetchPublicEvents, type PublicEvent } from "../../../entities/event";

export function PublicEventList() {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEvents() {
      const result = await fetchPublicEvents();
      if (Result.isSuccess(result)) setEvents(result.value);
      else setError(result.error.message);
    }
    void loadEvents();
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
