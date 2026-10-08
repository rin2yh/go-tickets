import { useEffect, useState } from "react";
import { ClerkProvider, SignIn, UserButton, useAuth, useUser } from "@clerk/react";

interface TicketType {
  id: number;
  name: string;
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
  ticketTypes = [],
}: {
  mode: "tickets" | "event";
  eventId?: number;
  ticketTypes?: TicketType[];
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
      <AuthenticatedContent mode={mode} eventId={eventId} ticketTypes={ticketTypes} />
    </ClerkProvider>
  );
}

function AuthenticatedContent({
  mode,
  eventId,
  ticketTypes,
}: {
  mode: "tickets" | "event";
  eventId: number;
  ticketTypes: TicketType[];
}) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p aria-live="polite">ログイン状態を確認しています</p>;
  if (!isSignedIn) return <SignIn routing="hash" />;
  return <TicketActions mode={mode} eventId={eventId} ticketTypes={ticketTypes} />;
}

function TicketActions({
  mode,
  eventId,
  ticketTypes,
}: {
  mode: "tickets" | "event";
  eventId: number;
  ticketTypes: TicketType[];
}) {
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
      {mode === "event" &&
        ticketTypes.map((ticket) => (
          <button
            key={ticket.id}
            disabled={busy}
            onClick={() => void register("register", ticket.id)}
          >
            {ticket.name}に申込
          </button>
        ))}
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

export function TicketAvailability({
  eventId,
  ticketTypeId,
}: {
  eventId: number;
  ticketTypeId: number;
}) {
  const [availability, setAvailability] = useState<{ capacity: number; reserved: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/events/${eventId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`残席を取得できません (${response.status})`);
        const event: { ticket_types: { id: number; capacity: number; reserved: number }[] } =
          await response.json();
        const ticket = event.ticket_types.find((item) => item.id === ticketTypeId);
        if (!ticket) throw new Error("チケット情報が見つかりません。");
        setAvailability({ capacity: ticket.capacity, reserved: ticket.reserved });
      })
      .catch((cause: Error) => setError(cause.message));
  }, [eventId, ticketTypeId]);
  if (error) return <span role="alert">{error}</span>;
  if (!availability) return <span aria-live="polite">残席を確認中</span>;
  return <span>残席 {Math.max(0, availability.capacity - availability.reserved)}</span>;
}
