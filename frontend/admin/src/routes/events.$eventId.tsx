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
export const Route = createFileRoute("/events/$eventId")({
  loader: async ({ params }) => {
    const response = await fetch("/api/events");
    if (!response.ok) throw new Error("イベントを読み込めません");
    const events: Event[] = await response.json();
    return events.find((event) => event.id === Number(params.eventId)) ?? null;
  },
  component: EventPage,
});
function EventPage() {
  const event = Route.useLoaderData();
  const { getToken } = useAuth();
  const router = useRouter();
  const [eventName, setEventName] = useState(event?.name ?? "");
  const [newName, setNewName] = useState("");
  const [capacity, setCapacity] = useState("0");
  const [editing, setEditing] = useState<Record<number, { name: string; capacity: string }>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(path: string, method: string, body: Record<string, string | number>) {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(body),
      });
      const result: { error?: string } = await r.json();
      if (!r.ok)
        throw new Error(
          result.error === "forbidden"
            ? "管理者権限がありません"
            : result.error === "capacity_below_reserved_or_invalid_event"
              ? "申込済み数を下回る定員には変更できません"
              : "保存できませんでした",
        );
      await router.invalidate();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!event)
    return (
      <main className="admin-main">
        <Alert variant="destructive">イベントが見つかりません。</Alert>
        <p>
          <Link to="/events">イベント一覧へ</Link>
        </p>
      </main>
    );
  return (
    <main className="admin-main">
      <p>
        <Link to="/events">← イベント一覧へ</Link>
      </p>
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">EVENT SETTINGS</p>
          <h1>イベント編集</h1>
        </div>
        <Badge variant="outline">イベント #{event.id}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
          <CardDescription>イベントの表示名を編集します。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save(`/api/events/${event.id}`, "PUT", { name: eventName });
            }}
          >
            <Label>
              イベント名
              <Input
                value={eventName}
                maxLength={200}
                required
                onChange={(e) => setEventName(e.target.value)}
              />
            </Label>
            <div>
              <Button disabled={busy}>イベントを保存</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="page-heading" style={{ marginTop: 38 }}>
        <div>
          <p className="page-eyebrow">TICKETS</p>
          <h2>チケット種別</h2>
        </div>
        <Badge variant="secondary">{event.ticket_types.length} 件</Badge>
      </div>
      {event.ticket_types.length === 0 && (
        <Card>
          <CardContent>
            <p>チケット種別はありません。</p>
          </CardContent>
        </Card>
      )}
      <div className="ticket-grid">
        {event.ticket_types.map((t) => {
          const value = editing[t.id] ?? { name: t.name, capacity: String(t.capacity) };
          return (
            <form
              key={t.id}
              onSubmit={(e) => {
                e.preventDefault();
                void save(`/api/ticket-types/${t.id}`, "PUT", {
                  name: value.name,
                  capacity: Number(value.capacity),
                });
              }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{t.name}</CardTitle>
                  <CardDescription>
                    申込済み {t.reserved} 件 / 定員 {t.capacity} 件
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="ticket-form">
                    <Label>
                      種別名
                      <Input
                        value={value.name}
                        maxLength={200}
                        required
                        onChange={(e) =>
                          setEditing({ ...editing, [t.id]: { ...value, name: e.target.value } })
                        }
                      />
                    </Label>
                    <Label>
                      定員
                      <Input
                        type="number"
                        min={t.reserved}
                        step="1"
                        value={value.capacity}
                        required
                        onChange={(e) =>
                          setEditing({ ...editing, [t.id]: { ...value, capacity: e.target.value } })
                        }
                      />
                    </Label>
                    <Button disabled={busy}>保存</Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          );
        })}
      </div>
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <CardTitle>チケット種別を追加</CardTitle>
          <CardDescription>販売するチケットの名前と定員を設定します。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="ticket-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(`/api/events/${event.id}/ticket-types`, "POST", {
                name: newName,
                capacity: Number(capacity),
              }).then((ok) => {
                if (ok) {
                  setNewName("");
                  setCapacity("0");
                }
              });
            }}
          >
            <Label>
              種別名
              <Input
                value={newName}
                maxLength={200}
                required
                onChange={(e) => setNewName(e.target.value)}
              />
            </Label>
            <Label>
              定員
              <Input
                type="number"
                min="0"
                step="1"
                value={capacity}
                required
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Label>
            <Button disabled={busy}>種別を作成</Button>
          </form>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive" style={{ marginTop: 16 }}>
          {error}
        </Alert>
      )}
    </main>
  );
}
