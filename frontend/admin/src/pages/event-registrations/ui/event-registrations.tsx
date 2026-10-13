import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@go-tickets/ui/components/alert";
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
import { useEvent, buildRegistrationsQueryOptions } from "../../../entities/event";
import { formatRegistrationDate } from "../../../shared/lib/datetime";
// oxlint-disable-next-line complexity
export interface RegistrationsProps {
  eventId: string;
  status: "active" | "cancelled";
  ticket: string;
  page: number;
  onSearchChange: (
    next: Partial<{ status: "active" | "cancelled"; ticket: string; page: number }>,
  ) => void;
}

export function Registrations(props: RegistrationsProps) {
  const { eventId, status, ticket, page, onSearchChange } = props;
  const event = useEvent();
  const { getToken } = useAuth();
  const registrations = useQuery(
    buildRegistrationsQueryOptions(eventId, status, ticket, page, getToken),
  );
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
  ) => onSearchChange(next);
  return (
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
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[600px] border-collapse text-left">
          <TableHeader className="bg-muted/60 text-xs text-muted-foreground">
            <TableRow>
              <TableHead className="px-4 py-3 font-medium">参加者名</TableHead>
              <TableHead className="px-4 py-3 font-medium">チケット種別</TableHead>
              <TableHead className="px-4 py-3 font-medium">申込日時</TableHead>
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
                    {formatRegistrationDate(row.created_at)}
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
  );
}
