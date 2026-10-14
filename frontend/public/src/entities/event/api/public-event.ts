import { Result } from "@praha/byethrow";

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

const eventCache = new Map<
  number,
  { expiresAt: number; request: Promise<Result.Result<PublicEvent, Error>> }
>();
const cacheDurationMs = 15_000;

export function fetchPublicEvents() {
  return Result.try({
    try: async () => {
      const response = await fetch("/api/events", { cache: "no-store" });
      if (!response.ok) throw new Error(`イベントを取得できません (${response.status})`);
      const events: PublicEvent[] = await response.json();
      return events;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("イベントを取得できません", { cause: error }),
  });
}

export function fetchPublicEvent(eventId: number): Promise<Result.Result<PublicEvent, Error>> {
  const cached = eventCache.get(eventId);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  let entry!: { expiresAt: number; request: Promise<Result.Result<PublicEvent, Error>> };
  const request = (async () => {
    const result = await Result.try({
      try: async () => {
        const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`イベントを取得できません (${response.status})`);
        const event: PublicEvent = await response.json();
        return event;
      },
      catch: (error) =>
        error instanceof Error ? error : new Error("イベントを取得できません", { cause: error }),
    });
    if (Result.isSuccess(result)) entry.expiresAt = Date.now() + cacheDurationMs;
    if (Result.isFailure(result) && eventCache.get(eventId) === entry) {
      eventCache.delete(eventId);
    }
    return result;
  })();
  entry = { expiresAt: Number.POSITIVE_INFINITY, request };
  eventCache.set(eventId, entry);
  return request;
}

export function invalidatePublicEvent(eventId: number) {
  eventCache.delete(eventId);
}
