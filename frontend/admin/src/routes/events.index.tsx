import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
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
    <main>
      <h2>イベント</h2>
      <form onSubmit={create}>
        <label>
          イベント名{" "}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
        </label>
        <button disabled={busy}>イベントを作成</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {events.length === 0 ? (
        <p>イベントはありません。</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <Link to="/events/$eventId" params={{ eventId: String(event.id) }}>
                {event.name}
              </Link>
              （チケット種別 {event.ticket_types.length} 件）
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
