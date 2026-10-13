import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Alert } from "@go-tickets/ui/components/alert";
import { Button } from "@go-tickets/ui/components/button";
import { Label } from "@go-tickets/ui/components/label";
import { useEvent } from "./events.$eventId";
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
  const event = useEvent();
  const { status, ticket, page } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { getToken } = useAuth();
  const registrations = useQuery({
    queryKey: ["admin", "events", eventId, "registrations", status, ticket, page],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `/api/admin/events/${eventId}/registrations?status=${status}&ticket=${ticket}&page=${page}`,
        { headers: { Authorization: `Bearer ${token ?? ""}` } },
      );
      if (!response.ok) throw new Error("参加者を読み込めません");
      const payload: Page = await response.json();
      return payload;
    },
    retry: false,
  });
  if (registrations.isError)
    return (
      <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <Alert variant="destructive">{registrations.error.message}</Alert>
      </div>
    );
  if (registrations.isPending)
    return (
      <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <p aria-live="polite">参加者を読み込み中です。</p>
      </div>
    );
  const data = registrations.data;
  const pages = Math.max(1, Math.ceil(data.total / 50));
  const first = data.total === 0 ? 0 : (page - 1) * 50 + 1;
  const last = Math.min(page * 50, data.total);
  const setSearch = (
    next: Partial<{ status: "active" | "cancelled"; ticket: string; page: number }>,
  ) => void navigate({ search: (old) => ({ ...old, ...next }) });
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold tracking-tight">参加者</h2>
      <div className="max-w-md space-y-2">
        <strong className="block text-sm font-semibold">
          {data.active} / {data.capacity}名
        </strong>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={data.active}
          aria-valuemin={0}
          aria-valuemax={data.capacity}
        >
          <span
            className="block h-full rounded-full bg-primary"
            style={{
              width: `${data.capacity ? Math.min(100, (data.active / data.capacity) * 100) : 0}%`,
            }}
          />
        </div>
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
        <select
          id="ticket-filter"
          value={ticket}
          onChange={(e) => setSearch({ ticket: e.target.value, page: 1 })}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="all">すべてのチケット</option>
          {event.ticket_types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[600px] border-collapse text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">参加者名</th>
              <th className="px-4 py-3 font-medium">チケット種別</th>
              <th className="px-4 py-3 font-medium">申込日時</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length ? (
              data.items.map((row, i) => (
                <tr key={`${row.ticket_type_id}-${row.created_at}-${i}`}>
                  <td className="border-t border-border px-4 py-3 font-medium">
                    {row.name || "名前未設定"}
                  </td>
                  <td className="border-t border-border px-4 py-3">{row.ticket_name}</td>
                  <td className="border-t border-border px-4 py-3 text-muted-foreground">
                    {fmt(row.created_at)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="border-t border-border px-4 py-10 text-center text-muted-foreground"
                >
                  該当する参加者はいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
  );
}

function fmt(value: string) {
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(normalized));
}
