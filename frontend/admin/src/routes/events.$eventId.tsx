import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
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
      <main>
        <h2>イベント</h2>
        <p role="alert">イベントが見つかりません。</p>
        <Link to="/events">イベント一覧へ</Link>
      </main>
    );
  return (
    <main>
      <p>
        <Link to="/events">イベント一覧へ</Link>
      </p>
      <h2>イベント編集</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(`/api/events/${event.id}`, "PUT", { name: eventName });
        }}
      >
        <label>
          イベント名{" "}
          <input
            value={eventName}
            maxLength={200}
            required
            onChange={(e) => setEventName(e.target.value)}
          />
        </label>
        <button disabled={busy}>イベントを保存</button>
      </form>
      <h3>チケット種別</h3>
      {event.ticket_types.length === 0 && <p>チケット種別はありません。</p>}
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
            <h4>{t.name}</h4>
            <label>
              種別名{" "}
              <input
                value={value.name}
                maxLength={200}
                required
                onChange={(e) =>
                  setEditing({ ...editing, [t.id]: { ...value, name: e.target.value } })
                }
              />
            </label>
            <label>
              定員{" "}
              <input
                type="number"
                min={t.reserved}
                step="1"
                value={value.capacity}
                required
                onChange={(e) =>
                  setEditing({ ...editing, [t.id]: { ...value, capacity: e.target.value } })
                }
              />
            </label>
            <p>申込済み: {t.reserved}</p>
            <button disabled={busy}>チケット種別を保存</button>
          </form>
        );
      })}
      <h3>チケット種別を追加</h3>
      <form
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
        <label>
          種別名{" "}
          <input
            value={newName}
            maxLength={200}
            required
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
        <label>
          定員{" "}
          <input
            type="number"
            min="0"
            step="1"
            value={capacity}
            required
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <button disabled={busy}>種別を作成</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
