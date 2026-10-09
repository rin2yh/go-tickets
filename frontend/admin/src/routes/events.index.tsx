import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@go-tickets/ui/components/card";
import { Input } from "@go-tickets/ui/components/input";
import { Label } from "@go-tickets/ui/components/label";
interface Event {
  id: number;
  name: string;
  ticket_types: { id: number; name: string; capacity: number; reserved: number }[];
}
export const Route = createFileRoute("/events/")({
  loader: async () => {
    const response = await fetch("/api/events");
    if (!response.ok) throw new Error("イベントを読み込めません");
    const events: Event[] = await response.json();
    return events;
  },
  component: Events,
});
function Events() {
  const { getToken } = useAuth();
  const events = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const r = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ name }),
      });
      const body: { error?: string } = await r.json();
      if (!r.ok)
        throw new Error(
          body.error === "forbidden" ? "管理者権限がありません" : "イベントを作成できません",
        );
      setName("");
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-main">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">EVENT MANAGEMENT</p>
          <h1>イベント</h1>
        </div>
        <Badge variant="outline">{events.length} 件</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>イベントを作成</CardTitle>
          <CardDescription>イベント名を登録して、チケット種別を設定しましょう。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="form-stack">
            <Label>
              イベント名
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="例: 春のカンファレンス"
                required
              />
            </Label>
            <div>
              <Button disabled={busy}>{busy ? "作成中…" : "イベントを作成"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive" style={{ marginTop: 16 }}>
          {error}
        </Alert>
      )}
      {events.length === 0 ? (
        <Card style={{ marginTop: 20 }}>
          <CardContent>
            <p>イベントはまだありません。上のフォームから最初のイベントを作成してください。</p>
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
            >
              <span className="event-row-name">{event.name}</span>
              <span className="event-row-meta">
                <Badge variant="secondary">チケット種別 {event.ticket_types.length} 件</Badge>
                <span>詳細を編集 →</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
