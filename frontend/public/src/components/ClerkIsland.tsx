import { useEffect, useState } from "react";
import { ClerkProvider, SignIn, UserButton, useAuth, useUser } from "@clerk/react";

interface EventSummary {
  id: number;
  name: string;
  ticket_types: { id: number; name: string; capacity: number; reserved: number }[];
}
interface MyRegistration {
  ticket_type_id: number;
  event_name: string;
  ticket_name: string;
  status: "active" | "cancelled";
}

async function clerkKey(): Promise<string> {
  const response = await fetch("/auth/config");
  if (!response.ok) throw new Error(`認証設定を取得できません (${response.status})`);
  const config: { publishableKey: string } = await response.json();
  return config.publishableKey;
}

export function ClerkIsland({
  mode,
  eventId = 0,
}: {
  mode: "tickets" | "event";
  eventId?: number;
}) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void clerkKey()
      .then((value) => active && setKey(value))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!key) return <p aria-live="polite">認証を読み込んでいます</p>;
  return (
    <ClerkProvider publishableKey={key}>
      <AuthenticatedContent mode={mode} eventId={eventId} />
    </ClerkProvider>
  );
}

function AuthenticatedContent({ mode, eventId }: { mode: "tickets" | "event"; eventId: number }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p aria-live="polite">ログイン状態を確認しています</p>;
  if (!isSignedIn) return <SignIn routing="hash" />;
  return <TicketActions mode={mode} eventId={eventId} />;
}

function TicketActions({ mode, eventId }: { mode: "tickets" | "event"; eventId: number }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [items, setItems] = useState<MyRegistration[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const userName = user?.username || user?.fullName || user?.firstName || "ユーザー";

  useEffect(() => {
    if (mode !== "tickets") return;
    void getToken()
      .then(async (token) => {
        if (!token) return;
        const response = await fetch("/registrations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) setItems(await response.json());
        else setMessage(`申込を取得できません (${response.status})`);
      })
      .catch((cause: Error) => setMessage(cause.message));
  }, [getToken, mode]);

  async function register(action: "register" | "cancel", ticketTypeId = eventId) {
    setBusy(true);
    try {
      const token = await getToken();
      const response = await fetch(
        action === "register" ? "/registrations" : "/registrations/cancel",
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
          : `${response.status}: ${result.error ?? "request_failed"}`,
      );
      await refreshTickets(response.ok && mode === "tickets", token, setItems);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p>ログイン中: {userName}</p>
      <UserButton />
      {mode === "event" && eventId > 0 && (
        <button disabled={busy} onClick={() => void register("register")}>
          申込
        </button>
      )}
      {mode === "tickets" && (
        <ul>
          {items.map((item) => (
            <li key={item.ticket_type_id}>
              {item.event_name} / {item.ticket_name} / {item.status}
              {item.status === "active" && (
                <button
                  disabled={busy}
                  onClick={() => void register("cancel", item.ticket_type_id)}
                >
                  キャンセル
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite">{message}</p>
    </section>
  );
}

async function refreshTickets(
  shouldRefresh: boolean,
  token: string | null,
  setItems: (items: MyRegistration[]) => void,
) {
  if (!shouldRefresh || !token) return;
  const response = await fetch("/registrations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok) setItems(await response.json());
}

export function EventList() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/events")
      .then(async (response) => {
        if (!response.ok) throw new Error(`イベント情報を取得できません (${response.status})`);
        setEvents(await response.json());
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (events.length === 0) return <p>現在、公開中のイベントはありません。</p>;
  return (
    <ul>
      {events.map((event) => (
        <li key={event.id}>
          <a href={`/events/${event.id}`}>{event.name}</a>
        </li>
      ))}
    </ul>
  );
}

export function EventDetails({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const requestedId = eventId || window.location.pathname.split("/").filter(Boolean).at(-1) || "";
    void fetch(`/api/events/${encodeURIComponent(requestedId)}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "イベントが見つかりません。"
              : `イベント情報を取得できません (${response.status})`,
          );
        setEvent(await response.json());
      })
      .catch((cause: Error) => setError(cause.message));
  }, [eventId]);
  if (error) return <p role="alert">{error}</p>;
  if (!event) return <p aria-live="polite">イベント情報を読み込んでいます</p>;
  return (
    <>
      <h2>{event.name}</h2>
      <ul>
        {event.ticket_types.map((ticket) => (
          <li key={ticket.id}>
            {ticket.name}: 残席 {ticket.capacity - ticket.reserved}
          </li>
        ))}
      </ul>
      {event.ticket_types[0] && <ClerkIsland mode="event" eventId={event.ticket_types[0].id} />}
    </>
  );
}
