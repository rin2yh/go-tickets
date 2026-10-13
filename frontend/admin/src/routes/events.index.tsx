import { useAuth } from "@clerk/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
import { Card, CardContent } from "@go-tickets/ui/components/card";

interface Event {
  id: number;
  name: string;
  starts_at: string | null;
  publication_status: "draft" | "published";
}
export const Route = createFileRoute("/events/")({ component: Events });
function Events() {
  const { getToken } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void getToken()
      .then(async (token) => {
        const response = await fetch("/api/admin/events", {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (response.ok) setEvents(await response.json());
        else setError("イベントを読み込めません");
      })
      .catch(() => setError("イベントを読み込めません"));
  }, [getToken]);
  return (
    <main className="admin-main">
      <div className="page-heading">
        <h1>イベント</h1>
        <Button asChild>
          <Link to="/events/create">＋ イベントを作成</Link>
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {events.length === 0 ? (
        <Card>
          <CardContent>
            <div className="empty-state">
              <h2>イベントはまだありません</h2>
              <p>イベントを作成して、開催情報やチケットを設定しましょう。</p>
              <Button asChild>
                <Link to="/events/create">イベントを作成</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="event-list">
          {events.map((event) => (
            <Link
              className="event-row"
              key={event.id}
              to="/events/$eventId"
              params={{ eventId: String(event.id) }}
              search={{ tab: "basic" }}
            >
              <span className="event-row-name">{event.name}</span>
              <span className="event-row-meta">
                {event.starts_at ? formatDate(event.starts_at) : "開催日時未設定"}
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
function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}
