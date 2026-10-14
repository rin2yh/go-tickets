import { useEffect, useState } from "react";
import { Result } from "@praha/byethrow";
import { UserButton, useAuth } from "@clerk/react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { invalidatePublicEvent, type PublicTicketType } from "../../../entities/event";

export type TicketType = PublicTicketType;
type TokenGetter = () => Promise<string | null>;
interface MyRegistration {
  ticket_type_id: number;
  event_name: string;
  ticket_name: string;
  status: "active" | "cancelled";
}

export function TicketActions({
  mode,
  eventId,
  ticketTypes,
  eventEndsAt,
  participantName,
  onEditName,
}: {
  mode: "tickets" | "event";
  eventId: number;
  ticketTypes: TicketType[];
  eventEndsAt: string | null;
  participantName: string;
  onEditName: () => void;
}) {
  const { getToken } = useAuth();
  const [items, setItems] = useState<MyRegistration[]>([]);
  const [loadedRegistrationKey, setLoadedRegistrationKey] = useState("");
  const [loadedTokenGetter, setLoadedTokenGetter] = useState<TokenGetter | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const historyKey = registrationHistoryKey(mode, eventId);
  const registrationsReady = isRegistrationHistoryReady(
    loadedRegistrationKey,
    loadedTokenGetter,
    historyKey,
    getToken,
  );
  const currentItems = registrationsReady ? items : [];

  useEffect(() => {
    let active = true;
    async function load() {
      const result = await loadRegistrations(getToken);
      if (!active) return;
      if (Result.isSuccess(result)) {
        setItems(result.value);
        setLoadedRegistrationKey(registrationHistoryKey(mode, eventId));
        setLoadedTokenGetter(() => getToken);
      } else setMessage(result.error.message);
    }
    void load();
    return () => {
      active = false;
    };
  }, [eventId, getToken, mode]);

  async function register(action: "register" | "cancel", ticketTypeId = eventId) {
    setBusy(true);
    const outcome = await Result.try({
      try: async () => {
        const token = await getToken();
        const response = await fetch(
          action === "register" ? "/api/registrations" : "/api/registrations/cancel",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ticket_type_id: ticketTypeId }),
          },
        );
        const result: { error?: string; status?: string } = await response.json();
        setMessage(
          response.ok
            ? (result.status ?? "完了しました")
            : registrationError(response.status, result.error),
        );
        if (response.ok && mode === "event") invalidatePublicEvent(eventId);
        const refresh = await refreshTickets(response.ok, token, setItems);
        if (refresh && Result.isFailure(refresh)) setMessage(refresh.error.message);
      },
      catch: (cause) =>
        cause instanceof Error ? cause : new Error("通信に失敗しました", { cause }),
    });
    if (Result.isFailure(outcome)) setMessage(outcome.error.message);
    setBusy(false);
  }

  return (
    <section className="mt-7">
      <Card>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Badge>ログイン中</Badge>
            <span>{participantName}</span>
            <Button variant="ghost" size="sm" onClick={onEditName}>
              参加者名を変更
            </Button>
            <UserButton />
          </div>
          {mode === "event" && (
            <RegisterButtons
              tickets={ticketTypes}
              eventEndsAt={eventEndsAt}
              registrations={currentItems}
              registrationsReady={registrationsReady}
              busy={busy}
              register={register}
            />
          )}
          {mode === "tickets" && (
            <RegistrationList items={currentItems} busy={busy} register={register} />
          )}
          <RegistrationMessage message={message} />
        </CardContent>
      </Card>
    </section>
  );
}

function registrationHistoryKey(mode: "tickets" | "event", eventId: number) {
  return `${mode}:${eventId}`;
}

function isRegistrationHistoryReady(
  loadedKey: string,
  loadedGetter: TokenGetter | null,
  currentKey: string,
  currentGetter: TokenGetter,
) {
  return loadedKey === currentKey && loadedGetter === currentGetter;
}

function loadRegistrations(getToken: () => Promise<string | null>) {
  return Result.try({
    try: async (): Promise<MyRegistration[]> => {
      const token = await getToken();
      if (!token) throw new Error("申込状態を取得できません。ページを再読み込みしてください。");
      const response = await fetch("/api/registrations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`申込を取得できません (${response.status})`);
      return response.json();
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("申込状態を取得できません", { cause: error }),
  });
}

function registrationError(status: number, code?: string) {
  const messages: Record<string, string> = {
    participant_name_required: "チケットを申し込む前に参加者名を設定してください。",
    registration_not_started: "受付前です。受付開始日時をご確認ください。",
    registration_ended: "受付は終了しました。",
    event_ended: "イベント終了後はお申し込みできません。",
    sold_out: "このチケットは満席です。",
    duplicate_registration: "このチケットにはすでにお申し込み済みです。",
    event_unpublished: "このイベントは現在公開されていません。",
  };
  return (code && messages[code]) || `${status}: ${code ?? "request_failed"}`;
}

export function RegisterButtons({
  tickets,
  eventEndsAt,
  registrations,
  registrationsReady,
  busy,
  register,
}: {
  tickets: TicketType[];
  eventEndsAt: string | null;
  registrations: MyRegistration[];
  registrationsReady: boolean;
  busy: boolean;
  register: (action: "register" | "cancel", ticketTypeId: number) => Promise<void>;
}) {
  const now = useCurrentTime();
  return tickets.map((ticket) => {
    const state = ticketActionState(ticket, eventEndsAt, registrations, now);
    return (
      <Button
        className="mr-2 mb-2"
        key={ticket.id}
        disabled={busy || !registrationsReady || state.disabled}
        onClick={() => void register("register", ticket.id)}
      >
        {state.label}
      </Button>
    );
  });
}

function ticketActionState(
  ticket: TicketType,
  eventEndsAt: string | null,
  registrations: MyRegistration[],
  now: number | null,
) {
  const active = registrations.some(
    (registration) => registration.ticket_type_id === ticket.id && registration.status === "active",
  );
  const status = registrationStatus(
    ticket.registration_starts_at,
    ticket.registration_ends_at,
    eventEndsAt,
    now,
  );
  const soldOut = ticket.reserved >= ticket.capacity;
  const label = active
    ? `${ticket.name}（申込済み）`
    : soldOut
      ? `${ticket.name}（満席）`
      : status !== "受付中"
        ? `${ticket.name}（${status}）`
        : `${ticket.name}に申込`;
  return { disabled: active || soldOut || status !== "受付中", label };
}

function registrationStatus(
  starts: string | null,
  ends: string | null,
  eventEnds: string | null,
  now: number | null,
) {
  if (now === null) return "受付状態を確認中…";
  if (eventEnds && now >= Date.parse(eventEnds)) return "受付終了";
  if (!starts || !ends || now < Date.parse(starts)) return "受付前";
  if (now >= Date.parse(ends)) return "受付終了";
  return "受付中";
}

function useCurrentTime() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function RegistrationList({
  items,
  busy,
  register,
}: {
  items: MyRegistration[];
  busy: boolean;
  register: (action: "register" | "cancel", ticketTypeId: number) => Promise<void>;
}) {
  return (
    <ul className="grid list-none gap-3 p-0">
      {items.map((item) => (
        <li
          className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
          key={item.ticket_type_id}
        >
          <span className="min-w-0 break-words">
            {item.event_name} / {item.ticket_name}
          </span>
          <Badge variant={item.status === "active" ? "default" : "secondary"}>
            {item.status === "active" ? "申込中" : "キャンセル済み"}
          </Badge>
          {item.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void register("cancel", item.ticket_type_id)}
            >
              キャンセル
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function RegistrationMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert
      variant={message.includes(":") ? "destructive" : "default"}
      className="mt-4"
      aria-live="polite"
    >
      {message}
    </Alert>
  );
}

async function refreshTickets(
  shouldRefresh: boolean,
  token: string | null,
  setItems: (items: MyRegistration[]) => void,
): Promise<Result.Result<void, Error> | undefined> {
  if (!shouldRefresh || !token) return undefined;
  const result = await Result.try({
    try: async () => {
      const response = await fetch("/api/registrations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`申込を取得できません (${response.status})`);
      const registrations: MyRegistration[] = await response.json();
      return registrations;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("申込を取得できません", { cause: error }),
  });
  if (Result.isSuccess(result)) {
    setItems(result.value);
    return Result.succeed(undefined);
  }
  return result;
}

export function TicketAvailability({
  registrationStartsAt,
  registrationEndsAt,
  eventEndsAt,
  capacity,
  reserved,
}: {
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  eventEndsAt: string | null;
  capacity: number;
  reserved: number;
}) {
  const now = useCurrentTime();
  const remaining = Math.max(0, capacity - reserved);
  if (now === null) return <Badge variant="outline">受付状態を確認中…（残席 {remaining}）</Badge>;
  const status = availabilityStatus(
    remaining,
    registrationStartsAt,
    registrationEndsAt,
    eventEndsAt,
    now,
  );
  return (
    <Badge variant={status === "受付中" ? "default" : "secondary"}>
      {status}（残席 {remaining}）
    </Badge>
  );
}

function availabilityStatus(
  remaining: number,
  starts: string | null,
  ends: string | null,
  eventEnds: string | null,
  now: number | null,
) {
  if (remaining === 0) return "満席";
  return registrationStatus(starts, ends, eventEnds, now);
}
