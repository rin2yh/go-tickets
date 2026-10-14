import { useAuth } from "@clerk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Result } from "@praha/byethrow";
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
import {
  type TicketType,
  buildEventQueryOptions,
  saveEventChange,
  useEvent,
} from "../../../entities/event";
import { toLocal, toUTC } from "../../../shared/lib/datetime";

interface TicketForm {
  name: string;
  capacity: string;
  starts: string;
  ends: string;
}

interface Change {
  path: string;
  method: "PUT" | "POST";
  body: Record<string, string | number | null>;
}

export function Tickets({ eventId }: { eventId: string }) {
  const { ticketSettings, newTicket, saveState } = useTicketSettings(eventId);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">チケット種別</h2>
        <Badge variant="secondary">{ticketSettings.event.ticket_types.length} 件</Badge>
      </div>
      {ticketSettings.event.ticket_types.length === 0 && (
        <Card className="mb-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">チケット種別はありません。</p>
          </CardContent>
        </Card>
      )}
      <div className="space-y-4">
        {ticketSettings.items.map(({ ticket, value }) => (
          <TicketEditor
            key={ticket.id}
            ticket={ticket}
            value={value}
            busy={ticketSettings.busy}
            onChange={(next) => ticketSettings.update(ticket.id, next)}
            onSave={(next) => ticketSettings.save(ticket.id, next)}
          />
        ))}
      </div>
      <NewTicketForm
        value={newTicket.value}
        onChange={newTicket.update}
        onSubmit={newTicket.submit}
        busy={ticketSettings.busy}
      />
      {saveState.error && (
        <Alert className="mt-4" variant="destructive">
          {saveState.error}
        </Alert>
      )}
      {saveState.notice && (
        <p className="mt-4 text-sm font-medium text-primary" role="status">
          {saveState.notice}
        </p>
      )}
      {saveState.refreshWarning && (
        <Alert className="mt-4" variant="destructive" role="alert">
          {saveState.refreshWarning}
        </Alert>
      )}
    </>
  );
}

function useTicketSettings(eventId: string) {
  const event = useEvent();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Record<number, TicketForm>>({});
  const [newTicket, updateNewTicket] = useState<TicketForm>({
    name: "",
    capacity: "0",
    starts: "",
    ends: "",
  });
  const [notice, setNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const mutation = useMutation({
    mutationFn: async ({ path, method, body }: Change) =>
      Result.unwrap(await saveEventChange(getToken, path, method, body)),
    onSuccess: async (_, change) => {
      setNotice("変更を保存しました。");
      if (change.method === "POST") {
        updateNewTicket({ name: "", capacity: "0", starts: "", ends: "" });
      }
      const refresh = await Result.try({
        try: async () => {
          await queryClient.invalidateQueries(
            { queryKey: buildEventQueryOptions(eventId, getToken).queryKey, exact: true },
            { throwOnError: true },
          );
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("再取得できません", { cause: error }),
      });
      if (Result.isSuccess(refresh)) setRefreshWarning("");
      else {
        setRefreshWarning(
          "変更は保存されましたが、最新情報を再取得できませんでした。画面を更新して確認してください。",
        );
      }
    },
  });
  const updateTicket = (id: number, value: TicketForm) =>
    setEditing((current) => ({ ...current, [id]: value }));

  const saveTicket = (id: number, value: TicketForm) => {
    setNotice("");
    setRefreshWarning("");
    mutation.mutate({
      path: `/api/ticket-types/${id}`,
      method: "PUT",
      body: {
        name: value.name,
        capacity: Number(value.capacity),
        registration_starts_at: toUTC(value.starts),
        registration_ends_at: toUTC(value.ends),
      },
    });
  };
  const createTicket = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNotice("");
    setRefreshWarning("");
    mutation.mutate({
      path: `/api/events/${event.id}/ticket-types`,
      method: "POST",
      body: {
        name: newTicket.name,
        capacity: Number(newTicket.capacity),
        registration_starts_at: toUTC(newTicket.starts),
        registration_ends_at: toUTC(newTicket.ends),
      },
    });
  };

  const tickets = event.ticket_types.map((ticket) => ({
    ticket,
    value: editing[ticket.id] ?? {
      name: ticket.name,
      capacity: String(ticket.capacity),
      starts: toLocal(ticket.registration_starts_at),
      ends: toLocal(ticket.registration_ends_at),
    },
  }));

  return {
    ticketSettings: {
      event,
      items: tickets,
      busy: mutation.isPending,
      update: updateTicket,
      save: saveTicket,
    },
    newTicket: {
      value: newTicket,
      update: updateNewTicket,
      submit: createTicket,
    },
    saveState: {
      error: mutation.isError ? mutation.error.message : "",
      notice,
      refreshWarning,
    },
  };
}

function TicketEditor({
  ticket,
  value,
  busy,
  onChange,
  onSave,
}: {
  ticket: TicketType;
  value: TicketForm;
  busy: boolean;
  onChange: (value: TicketForm) => void;
  onSave: (value: TicketForm) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{ticket.name}</CardTitle>
          <CardDescription>
            申込済み {ticket.reserved} 件 / 定員 {ticket.capacity} 件
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto grid w-full max-w-[720px] gap-5">
            <div className="grid gap-2">
              <Label htmlFor={`ticket-name-${ticket.id}`}>種別名</Label>
              <Input
                id={`ticket-name-${ticket.id}`}
                value={value.name}
                maxLength={200}
                required
                onChange={(e) => onChange({ ...value, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`ticket-capacity-${ticket.id}`}>定員</Label>
              <Input
                id={`ticket-capacity-${ticket.id}`}
                type="number"
                min={ticket.reserved}
                step="1"
                value={value.capacity}
                required
                onChange={(e) => onChange({ ...value, capacity: e.target.value })}
              />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor={`ticket-starts-${ticket.id}`}>受付開始日時（JST）</Label>
                <Input
                  id={`ticket-starts-${ticket.id}`}
                  type="datetime-local"
                  value={value.starts}
                  onChange={(e) => onChange({ ...value, starts: e.target.value })}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor={`ticket-ends-${ticket.id}`}>受付終了日時（JST）</Label>
                <Input
                  id={`ticket-ends-${ticket.id}`}
                  type="datetime-local"
                  value={value.ends}
                  onChange={(e) => onChange({ ...value, ends: e.target.value })}
                />
              </div>
            </div>
            <div className="pt-1">
              <Button disabled={busy}>保存</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function NewTicketForm({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: TicketForm;
  onChange: (value: TicketForm) => void;
  onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;
  busy: boolean;
}) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>チケット種別を追加</CardTitle>
        <CardDescription>販売するチケットの名前と定員を設定します。</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="mx-auto grid w-full max-w-[720px] gap-5" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="new-ticket-name">種別名</Label>
            <Input
              id="new-ticket-name"
              value={value.name}
              maxLength={200}
              required
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="new-ticket-starts">受付開始日時（JST）</Label>
              <Input
                id="new-ticket-starts"
                type="datetime-local"
                value={value.starts}
                onChange={(e) => onChange({ ...value, starts: e.target.value })}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="new-ticket-ends">受付終了日時（JST）</Label>
              <Input
                id="new-ticket-ends"
                type="datetime-local"
                value={value.ends}
                onChange={(e) => onChange({ ...value, ends: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-ticket-capacity">定員</Label>
            <Input
              id="new-ticket-capacity"
              type="number"
              min="0"
              step="1"
              value={value.capacity}
              required
              onChange={(e) => onChange({ ...value, capacity: e.target.value })}
            />
          </div>
          <div className="pt-1">
            <Button disabled={busy}>種別を作成</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
