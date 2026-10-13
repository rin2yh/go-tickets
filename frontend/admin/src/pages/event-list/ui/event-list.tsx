import { useAuth } from "@clerk/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";

import { fetchEvents } from "../../../entities/event";
import type { EventSummary } from "../../../entities/event";
import { formatJST } from "../../../shared/lib/datetime";
export function Events() {
  const { getToken } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function loadEvents() {
      try {
        const result = await fetchEvents(getToken);
        if (!cancelled) setEvents(result);
      } catch {
        if (!cancelled) setError("イベントを読み込めません");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, [getToken]);
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">イベント</h1>
        <Button asChild>
          <Link to="/events/create">＋ イベントを作成</Link>
        </Button>
      </div>
      {loading ? (
        <p
          className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground"
          role="status"
        >
          イベントを読み込んでいます…
        </p>
      ) : error ? (
        <Alert className="max-w-2xl" variant="destructive">
          {error}
        </Alert>
      ) : events.length === 0 ? (
        <section className="rounded-xl border bg-card px-5 py-10 text-center sm:px-8">
          <h2 className="text-lg font-semibold">イベントはまだありません</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            イベントを作成して、開催情報やチケットを設定しましょう。
          </p>
          <Button className="mt-5" asChild>
            <Link to="/events/create">イベントを作成</Link>
          </Button>
        </section>
      ) : (
        <div className="grid gap-2">
          {events.map((event) => (
            <Link
              className="group flex min-w-0 flex-col gap-2 rounded-lg border bg-card px-4 py-4 text-card-foreground no-underline transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              key={event.id}
              to="/events/$eventId"
              params={{ eventId: String(event.id) }}
              search={{ tab: "basic" }}
            >
              <span className="min-w-0 break-words font-medium group-hover:text-primary">
                {event.name}
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>
                  {event.starts_at ? formatJST(event.starts_at, "medium") : "開催日時未設定"}
                </span>
                <Badge variant={event.publication_status === "published" ? "default" : "secondary"}>
                  {event.publication_status === "published" ? "公開中" : "下書き"}
                </Badge>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
