import { useEffect, useState } from "react";
import { ClerkProvider, SignIn, UserButton, useAuth, useUser } from "@clerk/react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import {
  fetchPublicEvent,
  invalidatePublicEvent,
  type PublicTicketType,
} from "../lib/public-event";

type TicketType = PublicTicketType;
type TokenGetter = () => Promise<string | null>;
interface MyRegistration {
  ticket_type_id: number;
  event_name: string;
  ticket_name: string;
  status: "active" | "cancelled";
}

async function clerkKey(): Promise<string> {
  const response = await fetch("/api/auth/config");
  if (!response.ok) throw new Error(`認証設定を取得できません (${response.status})`);
  const config: { publishableKey: string } = await response.json();
  return config.publishableKey;
}

export function ClerkIsland() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pathname, setPathname] = useState("");
  useEffect(() => {
    let active = true;
    void clerkKey()
      .then((value) => active && setKey(value))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onPageLoad = () => setPathname(window.location.pathname);
    onPageLoad();
    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);

  const needsAuth = pathname === "/tickets" || /^\/events\/\d+\/?$/.test(pathname);

  if (error) return needsAuth ? <Alert variant="destructive">{error}</Alert> : null;
  if (!key && needsAuth)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">認証を読み込んでいます…</p>
        </CardContent>
      </Card>
    );
  if (!key) return null;
  return (
    <ClerkProvider publishableKey={key}>
      <AuthenticatedContent />
    </ClerkProvider>
  );
}

// oxlint-disable-next-line complexity
function AuthenticatedContent() {
  const [pathname, setPathname] = useState("");
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const mode = pathname === "/tickets" ? "tickets" : "event";
  const eventId = Number(pathname.match(/^\/events\/(\d+)\/?$/)?.[1] ?? 0);
  const [ticketTypesForEvent, setTicketTypesForEvent] = useState<{
    eventId: number;
    ticketTypes: TicketType[];
    endsAt: string | null;
  }>({ eventId: 0, ticketTypes: [], endsAt: null });
  const ticketTypes =
    ticketTypesForEvent.eventId === eventId ? ticketTypesForEvent.ticketTypes : [];
  const eventEndsAt = ticketTypesForEvent.eventId === eventId ? ticketTypesForEvent.endsAt : null;
  useEffect(() => {
    const onPageLoad = () => setPathname(window.location.pathname);
    onPageLoad();
    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("needs-participant-name", isSignedIn && participantName === "");
    return () => document.body.classList.remove("needs-participant-name");
  }, [isSignedIn, participantName]);
  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void getToken()
      .then((token) =>
        fetch("/api/profile", { headers: { Authorization: `Bearer ${token ?? ""}` } }),
      )
      .then((response) => response?.json())
      .then((payload) => {
        if (active) setParticipantName(payload.name || "");
      })
      .catch(() => {
        if (active) setParticipantName("");
      });
    return () => {
      active = false;
    };
  }, [getToken, isSignedIn]);
  useEffect(() => {
    if (mode !== "event" || !eventId) return;
    let active = true;
    void fetchPublicEvent(eventId)
      .then((event) => {
        if (active)
          setTicketTypesForEvent({
            eventId,
            ticketTypes: event.ticket_types,
            endsAt: event.ends_at,
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [eventId, mode]);
  if (pathname !== "/tickets" && !/^\/events\/\d+\/?$/.test(pathname)) return null;
  if (!isLoaded)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">ログイン状態を確認しています…</p>
        </CardContent>
      </Card>
    );
  if (!isSignedIn)
    return (
      <Card>
        <CardContent>
          <SignIn routing="hash" />
        </CardContent>
      </Card>
    );
  if (participantName === null)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">参加者情報を確認しています…</p>
        </CardContent>
      </Card>
    );
  if (!participantName || editingName)
    return (
      <ParticipantNameForm
        initialName={participantName || user?.fullName || user?.firstName || ""}
        onSaved={(name) => {
          setParticipantName(name);
          setEditingName(false);
        }}
      />
    );
  return (
    <TicketActions
      mode={mode}
      eventId={eventId}
      ticketTypes={ticketTypes}
      eventEndsAt={eventEndsAt}
      participantName={participantName}
      onEditName={() => setEditingName(true)}
    />
  );
}

function ParticipantNameForm({
  initialName,
  onSaved,
}: {
  initialName: string;
  onSaved: (name: string) => void;
}) {
  const { getToken } = useAuth();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card>
      <CardContent>
        <form
          className="participant-name-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const normalized = name.trim();
            if (!normalized) return;
            setBusy(true);
            setError("");
            try {
              const token = await getToken();
              const response = await fetch("/api/profile", {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${token ?? ""}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: normalized }),
              });
              if (!response.ok) throw new Error("参加者名を保存できません");
              const result = await response.json();
              onSaved(result.name);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "保存に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>参加者名を設定</h2>
          <p>
            イベントの参加者一覧などで使う名前です。実名・ハンドルネームのどちらでも構いません。あとから変更できます。
          </p>
          <label>
            参加者名
            <input
              value={name}
              maxLength={100}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button disabled={busy || !name.trim()}>保存して続ける</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TicketActions({
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
    void loadRegistrations(getToken)
      .then((registrations) => {
        if (!active) return;
        setItems(registrations);
        setLoadedRegistrationKey(registrationHistoryKey(mode, eventId));
        setLoadedTokenGetter(() => getToken);
      })
      .catch((cause: Error) => active && setMessage(cause.message));
    return () => {
      active = false;
    };
  }, [eventId, getToken, mode]);

  async function register(action: "register" | "cancel", ticketTypeId = eventId) {
    setBusy(true);
    try {
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
      await refreshTickets(response.ok, token, setItems);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <Card>
        <CardContent>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
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

async function loadRegistrations(
  getToken: () => Promise<string | null>,
): Promise<MyRegistration[]> {
  const token = await getToken();
  if (!token) throw new Error("申込状態を取得できません。ページを再読み込みしてください。");
  const response = await fetch("/api/registrations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`申込を取得できません (${response.status})`);
  return response.json();
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
        style={{ margin: "0 10px 10px 0" }}
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
    <ul className="public-ticket-list">
      {items.map((item) => (
        <li className="public-ticket-row" key={item.ticket_type_id}>
          <span>
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
      style={{ marginTop: 16 }}
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
) {
  if (!shouldRefresh || !token) return;
  const response = await fetch("/api/registrations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok) setItems(await response.json());
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
