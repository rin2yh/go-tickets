import { useEffect, useState } from "react";
import { Result } from "@praha/byethrow";
import { UserButton, useAuth } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { publicEventKeys, type PublicTicketType } from "../../../entities/event";
import { loadRegistrations, submitRegistration, type MyRegistration } from "../api/registration";

export type TicketType = PublicTicketType;
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
  const { registrationsQuery, registrationMutation, retryMutation, register } = useTicketActions({
    mode,
    eventId,
  });
  const registrations = registrationsQuery.isSuccess ? registrationsQuery.data : [];

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
              registrations={registrations}
              registrationsReady={registrationsQuery.isSuccess}
              busy={registrationMutation.isPending}
              register={register}
            />
          )}
          {mode === "tickets" && registrationsQuery.isSuccess && (
            <RegistrationList
              items={registrations}
              busy={registrationMutation.isPending}
              register={register}
            />
          )}
          {registrationsQuery.isPending && (
            <p role="status" className="mt-4">
              申込履歴を読み込み中…
            </p>
          )}
          <RegistrationFeedback
            queryError={registrationsQuery.error}
            actionError={registrationMutation.error}
            actionMessage={registrationMutation.data?.status ?? ""}
            retrying={retryMutation.isPending || registrationsQuery.isFetching}
            onRetry={() => retryMutation.mutate()}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function RegistrationFeedback({
  queryError,
  actionError,
  actionMessage,
  retrying,
  onRetry,
}: {
  queryError: Error | null;
  actionError: Error | null;
  actionMessage: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  const syncError = actionError instanceof RegistrationSyncError ? actionError : null;
  const message = syncError ? "" : (actionError?.message ?? actionMessage);
  return (
    <>
      {(queryError || syncError) && (
        <RegistrationQueryAlert
          error={queryError}
          syncFailed={syncError !== null}
          message={syncError?.message ?? ""}
          retrying={retrying}
          onRetry={onRetry}
        />
      )}
      <RegistrationMessage message={message} />
    </>
  );
}

function RegistrationQueryAlert({
  error,
  syncFailed,
  message,
  retrying,
  onRetry,
}: {
  error: Error | null;
  syncFailed: boolean;
  message: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive" className="mt-4">
      {error && <p>{error.message}</p>}
      {syncFailed && <p>{message}</p>}
      <Button variant="outline" disabled={retrying} onClick={onRetry}>
        再試行
      </Button>
    </Alert>
  );
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
  register: (action: "register" | "cancel", ticketTypeId: number) => void;
}) {
  const now = useCurrentTime();
  return tickets.map((ticket) => {
    const state = ticketActionState(ticket, eventEndsAt, registrations, now);
    return (
      <Button
        className="mr-2 mb-2"
        key={ticket.id}
        disabled={busy || !registrationsReady || state.disabled}
        onClick={() => register("register", ticket.id)}
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
  register: (action: "register" | "cancel", ticketTypeId: number) => void;
}) {
  return (
    <ul className="grid list-none gap-3 p-0">
      {items.length === 0 && <li>申込済みのチケットはありません。</li>}
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
              onClick={() => register("cancel", item.ticket_type_id)}
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

class RegistrationSyncError extends Error {
  constructor(status: string | undefined, cause: Error) {
    super(`${status ?? "操作は完了しました"}。状態を更新できませんでした。再試行してください。`, {
      cause,
    });
  }
}

function useTicketActions({ mode, eventId }: { mode: "tickets" | "event"; eventId: number }) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const registrationsQuery = useQuery({
    queryKey: ["registrations", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const result = await loadRegistrations(getToken);
      if (Result.isFailure(result)) throw result.error;
      return result.value;
    },
  });
  const syncQueries = () =>
    Promise.all([
      queryClient.invalidateQueries(
        { queryKey: ["registrations", userId] },
        { throwOnError: true },
      ),
      ...(mode === "event"
        ? [
            queryClient.invalidateQueries(
              { queryKey: publicEventKeys.detail(eventId) },
              { throwOnError: true },
            ),
          ]
        : []),
    ]);
  const registrationMutation = useMutation({
    mutationFn: async ({
      action,
      ticketTypeId,
    }: {
      action: "register" | "cancel";
      ticketTypeId: number;
    }) => {
      const result = await submitRegistration(getToken, action, ticketTypeId);
      if (Result.isFailure(result)) throw result.error;
      const syncResult = await Result.try({
        try: syncQueries,
        catch: (error) =>
          error instanceof Error
            ? error
            : new Error("申込状態を更新できませんでした", { cause: error }),
      });
      if (Result.isFailure(syncResult)) {
        throw new RegistrationSyncError(result.value.status, syncResult.error);
      }
      return result.value;
    },
  });
  const retryMutation = useMutation({
    mutationFn: syncQueries,
    onSuccess: () => registrationMutation.reset(),
  });
  const register = (action: "register" | "cancel", ticketTypeId = eventId) =>
    registrationMutation.mutate({ action, ticketTypeId });

  return { registrationsQuery, registrationMutation, retryMutation, register };
}
