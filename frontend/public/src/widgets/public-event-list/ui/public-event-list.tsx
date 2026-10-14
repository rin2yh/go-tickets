import { useQuery } from "@tanstack/react-query";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { QueryProvider } from "../../../shared/lib/query";
import { type PublicEvent, publicEventsQueryOptions } from "../../../entities/event";

export function PublicEventList() {
  return (
    <QueryProvider>
      <PublicEventListContent />
    </QueryProvider>
  );
}

function PublicEventListContent() {
  const {
    data: events,
    error,
    isPending,
    refetch,
    isFetching,
  } = useQuery(publicEventsQueryOptions());

  if (isPending)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">イベントを読み込み中です。</p>
        </CardContent>
      </Card>
    );
  if (error)
    return (
      <Alert variant="destructive">
        <p>{error.message}</p>
        <button type="button" disabled={isFetching} onClick={() => void refetch()}>
          再試行
        </button>
      </Alert>
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
        <PublicEventListItem key={event.id} event={event} />
      ))}
    </ul>
  );
}

function PublicEventListItem({ event }: { event: PublicEvent }) {
  return (
    <li>
      <Card>
        <a className="block h-full p-5 text-inherit no-underline" href={`/events/${event.id}`}>
          <Badge>{event.publication_status === "published" ? "公開中" : ""}</Badge>
          <h2 className="mt-3.5 mb-2 text-lg font-semibold text-foreground">{event.name}</h2>
          <p className="m-0 text-sm text-muted-foreground">イベント詳細とチケットを見る　→</p>
        </a>
      </Card>
    </li>
  );
}
