import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
import { Label } from "@go-tickets/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@go-tickets/ui/components/native-select";
import { Progress } from "@go-tickets/ui/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@go-tickets/ui/components/table";
import { EventTabs } from "../components/event-tabs";
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
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <Alert variant="destructive">{error}</Alert>
      </main>
    );
  if (!event || !data)
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
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
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
      <p className="mb-4 text-sm">
        <Link className="text-muted-foreground hover:text-foreground" to="/events">
          ← イベント一覧
        </Link>
      </p>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.name}</h1>
          <Badge variant={event.publication_status === "published" ? "default" : "secondary"}>
            {event.publication_status === "published" ? "公開中" : "下書き"}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {event.starts_at ? fmt(event.starts_at) : "開催日時未設定"}
        </p>
      </header>
      <EventTabs
        eventId={eventId}
        activeTab="registrations"
        registrationSearch={{ tab: "basic", status, ticket, page }}
      />
      <section className="space-y-5">
        <h2 className="text-xl font-semibold tracking-tight">参加者</h2>
        <div className="max-w-md space-y-2">
          <strong className="block text-sm font-semibold">
            {data.active} / {data.capacity}名
          </strong>
          <Progress value={data.active} max={data.capacity} aria-label="参加者の申込状況" />
        </div>
        <div className="flex gap-2 border-b border-border" role="group" aria-label="申込ステータス">
          <button
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              status === "active"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={status === "active"}
            onClick={() => setSearch({ status: "active", page: 1 })}
          >
            申込中 {data.active}
          </button>
          <button
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              status === "cancelled"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={status === "cancelled"}
            onClick={() => setSearch({ status: "cancelled", page: 1 })}
          >
            キャンセル済み {data.cancelled}
          </button>
        </div>
        <div className="grid w-full max-w-sm gap-2">
          <Label htmlFor="ticket-filter">チケット種別</Label>
          <NativeSelect
            id="ticket-filter"
            value={ticket}
            onChange={(e) => setSearch({ ticket: e.target.value, page: 1 })}
          >
            <NativeSelectOption value="all">すべてのチケット</NativeSelectOption>
            {event.ticket_types.map((t) => (
              <NativeSelectOption key={t.id} value={t.id}>
                {t.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="min-w-[600px] border-collapse text-left">
            <TableHeader className="bg-muted/60 text-xs text-muted-foreground">
              <TableRow>
                <TableHead className="h-auto px-4 py-3 font-medium">参加者名</TableHead>
                <TableHead className="h-auto px-4 py-3 font-medium">チケット種別</TableHead>
                <TableHead className="h-auto px-4 py-3 font-medium">申込日時</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length ? (
                data.items.map((row, i) => (
                  <TableRow key={`${row.ticket_type_id}-${row.created_at}-${i}`}>
                    <TableCell className="border-t border-border px-4 py-3 font-medium">
                      {row.name || "名前未設定"}
                    </TableCell>
                    <TableCell className="border-t border-border px-4 py-3">
                      {row.ticket_name}
                    </TableCell>
                    <TableCell className="border-t border-border px-4 py-3 text-muted-foreground">
                      {fmt(row.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="border-t border-border px-4 py-10 text-center text-muted-foreground"
                  >
                    該当する参加者はいません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <footer className="flex flex-col items-start justify-between gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <span className="tabular-nums">
            {first}–{last} / {data.total}件
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setSearch({ page: page - 1 })}
            >
              前へ
            </Button>
            <span className="tabular-nums">
              {page} / {pages}
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
