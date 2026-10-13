import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
interface Event {
  id: number;
  name: string;
  starts_at: string | null;
  publication_status: "draft" | "published";
  ticket_types: { id: number; name: string; capacity: number }[];
}
interface Page {
  items: { name: string; ticket_type_id: number; ticket_name: string; created_at: string }[];
  total: number;
  active: number;
  cancelled: number;
  capacity: number;
}
export const Route = createFileRoute("/events/$eventId/registrations")({
  // oxlint-disable-next-line no-restricted-types
  validateSearch: (s: Record<string, unknown>) => ({
    status: s.status === "cancelled" ? ("cancelled" as const) : ("active" as const),
    ticket: typeof s.ticket === "string" ? s.ticket : "all",
    page: Math.max(1, Number(s.page) || 1),
  }),
  component: Registrations,
});
// oxlint-disable-next-line complexity
function Registrations() {
  const { eventId } = Route.useParams();
  const { status, ticket, page } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { getToken } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void getToken()
      .then(async (token) => {
        const headers = { Authorization: `Bearer ${token ?? ""}` };
        const [e, p] = await Promise.all([
          fetch(`/api/admin/events/${eventId}`, { headers }),
          fetch(
            `/api/admin/events/${eventId}/registrations?status=${status}&ticket=${ticket}&page=${page}`,
            { headers },
          ),
        ]);
        if (!e.ok || !p.ok) throw new Error("参加者を読み込めません");
        const [ev, payload] = await Promise.all([e.json(), p.json()]);
        if (live) {
          setEvent(ev);
          setData(payload);
        }
      })
      .catch((x: Error) => live && setError(x.message));
    return () => {
      live = false;
    };
  }, [eventId, getToken, status, ticket, page]);
  if (error)
    return (
      <main className="admin-main">
        <Alert variant="destructive">{error}</Alert>
      </main>
    );
  if (!event || !data)
    return (
      <main className="admin-main">
        <p aria-live="polite">参加者を読み込み中です。</p>
      </main>
    );
  const pages = Math.max(1, Math.ceil(data.total / 50));
  const first = data.total === 0 ? 0 : (page - 1) * 50 + 1;
  const last = Math.min(page * 50, data.total);
  const setSearch = (
    next: Partial<{ status: "active" | "cancelled"; ticket: string; page: number }>,
  ) => void navigate({ search: (old) => ({ ...old, ...next }) });
  return (
    <main className="admin-main">
      <p>
        <Link to="/events">← イベント一覧</Link>
      </p>
      <header className="page-heading">
        <div>
          <h1>{event.name}</h1>
          <p className="event-meta">
            <Badge variant="outline">
              {event.publication_status === "published" ? "公開中" : "下書き"}
            </Badge>
            {event.starts_at ? fmt(event.starts_at) : "開催日時未設定"}
          </p>
        </div>
      </header>
      <nav className="event-tabs" aria-label="イベント内ナビゲーション">
        <Link to="/events/$eventId" params={{ eventId }} search={{ tab: "basic" }}>
          基本情報
        </Link>
        <Link to="/events/$eventId" params={{ eventId }} search={{ tab: "tickets" }}>
          チケット設定
        </Link>
        <Link
          to="/events/$eventId/registrations"
          params={{ eventId }}
          search={{ tab: "basic", status, ticket, page }}
          className="active"
          aria-current="page"
        >
          参加者
        </Link>
      </nav>
      <section className="attendee-section">
        <h2>参加者</h2>
        <div className="capacity-summary">
          <strong>
            {data.active} / {data.capacity}名
          </strong>
          <div
            className="capacity-track"
            role="progressbar"
            aria-valuenow={data.active}
            aria-valuemin={0}
            aria-valuemax={data.capacity}
          >
            <span
              style={{
                width: `${data.capacity ? Math.min(100, (data.active / data.capacity) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="registration-tabs" role="group" aria-label="申込ステータス">
          <button
            className={status === "active" ? "selected" : ""}
            aria-pressed={status === "active"}
            onClick={() => setSearch({ status: "active", page: 1 })}
          >
            申込中 {data.active}
          </button>
          <button
            className={status === "cancelled" ? "selected" : ""}
            aria-pressed={status === "cancelled"}
            onClick={() => setSearch({ status: "cancelled", page: 1 })}
          >
            キャンセル済み {data.cancelled}
          </button>
        </div>
        <label className="ticket-filter">
          チケット種別
          <select
            aria-label="チケット種別"
            value={ticket}
            onChange={(e) => setSearch({ ticket: e.target.value, page: 1 })}
          >
            <option value="all">すべてのチケット</option>
            {event.ticket_types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="attendee-table-scroll">
          <table className="attendee-table">
            <thead>
              <tr>
                <th>参加者名</th>
                <th>チケット種別</th>
                <th>申込日時</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length ? (
                data.items.map((row, i) => (
                  <tr key={`${row.ticket_type_id}-${row.created_at}-${i}`}>
                    <td>{row.name || "名前未設定"}</td>
                    <td>{row.ticket_name}</td>
                    <td>{fmt(row.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="empty-attendees">
                    該当する参加者はいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="attendee-pagination">
          <span>
            {first}–{last} / {data.total}件
          </span>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setSearch({ page: page - 1 })}
            >
              前へ
            </Button>
            <span>
              {" "}
              {page} / {pages}{" "}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setSearch({ page: page + 1 })}
            >
              次へ
            </Button>
          </div>
        </footer>
      </section>
    </main>
  );
}
function fmt(v: string) {
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(v) ? v : `${v.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(normalized));
}
