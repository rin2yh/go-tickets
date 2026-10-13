import { useAuth } from "@clerk/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  publication_status: "draft" | "published";
  ticket_types: { id: number; name: string; capacity: number; reserved: number }[];
}
export const Route = createFileRoute("/events/")({
  component: Events,
});
function Events() {
  const { getToken } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [publicationStatus, setPublicationStatus] = useState<"draft" | "published">("draft");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const r = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          name,
          description,
          starts_at: toUTC(startsAt),
          ends_at: toUTC(endsAt),
          venue_name: venueName || null,
          venue_address: venueAddress || null,
          publication_status: publicationStatus,
        }),
      });
      const body: { error?: string } = await r.json();
      if (!r.ok) throw new Error(createErrorMessage(body.error));
      setName("");
      setDescription("");
      setStartsAt("");
      setEndsAt("");
      setVenueName("");
      setVenueAddress("");
      setPublicationStatus("draft");
      const response2 = await fetch("/api/admin/events", {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (response2.ok) setEvents(await response2.json());
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
          <CardDescription>下書きは未入力項目を後から設定できます。</CardDescription>
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
              />
            </Label>
            <Label>
              イベント説明（Markdown）
              <textarea
                aria-label="イベント説明（Markdown）"
                value={description}
                rows={5}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Label>
            <Label>
              開催開始日時（JST）
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Label>
            <Label>
              開催終了日時（JST）
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Label>
            <Label>
              会場名
              <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} />
            </Label>
            <Label>
              会場住所
              <Input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
            </Label>
            <Label>
              公開状態
              <select
                aria-label="公開状態"
                value={publicationStatus}
                onChange={(e) =>
                  setPublicationStatus(e.target.value === "published" ? "published" : "draft")
                }
              >
                <option value="draft">下書き</option>
                <option value="published">公開</option>
              </select>
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
              search={{ tab: "basic" }}
            >
              <span className="event-row-name">{event.name}</span>
              <span className="event-row-meta">
                <Badge variant={event.publication_status === "published" ? "default" : "secondary"}>
                  {event.publication_status === "published" ? "公開中" : "下書き"}
                </Badge>
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

function toUTC(value: string) {
  return value ? new Date(`${value}+09:00`).toISOString() : null;
}

function createErrorMessage(code?: string) {
  const messages: Record<string, string> = {
    forbidden: "管理者権限がありません",
    invalid_name: "イベント名は200文字以内で入力してください",
    description_required: "公開するイベントには説明が必要です",
    event_datetime_required: "公開するイベントには開催開始・終了日時が必要です",
    invalid_event_period: "開催終了日時は開始日時より後にしてください",
    invalid_datetime: "日時を正しく入力してください",
  };
  return (code && messages[code]) || "イベントを作成できません";
}
