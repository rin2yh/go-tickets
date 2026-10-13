export interface PublicTicketType {
  id: number;
  name: string;
  capacity: number;
  reserved: number;
  registration_starts_at: string | null;
  registration_ends_at: string | null;
}

export interface PublicEvent {
  id: number;
  name: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  publication_status: "draft" | "published";
  ticket_types: PublicTicketType[];
}

const eventCache = new Map<number, { expiresAt: number; request: Promise<PublicEvent> }>();
const cacheDurationMs = 15_000;

export async function fetchPublicEvents(): Promise<PublicEvent[]> {
  const response = await fetch("/api/events", { cache: "no-store" });
  if (!response.ok) throw new Error(`イベントを取得できません (${response.status})`);
  return response.json();
}

export function fetchPublicEvent(eventId: number): Promise<PublicEvent> {
  const cached = eventCache.get(eventId);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  let entry: { expiresAt: number; request: Promise<PublicEvent> };
  const request = Promise.resolve()
    .then(() => fetch(`/api/events/${eventId}`, { cache: "no-store" }))
    .then(async (response) => {
      if (!response.ok) throw new Error(`イベントを取得できません (${response.status})`);
      const event: PublicEvent = await response.json();
      entry.expiresAt = Date.now() + cacheDurationMs;
      return event;
    })
    .catch((error: Error) => {
      if (eventCache.get(eventId) === entry) eventCache.delete(eventId);
      throw error;
    });
  entry = { expiresAt: Number.POSITIVE_INFINITY, request };
  eventCache.set(eventId, entry);
  return entry.request;
}

export function invalidatePublicEvent(eventId: number) {
  eventCache.delete(eventId);
}
