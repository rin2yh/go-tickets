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

interface CachedEvent {
  expiresAt: number;
  request: Promise<Result.Result<PublicEvent, Error>>;
}

const eventCache = new Map<number, CachedEvent>();
const cacheDurationMs = 15_000;

export async function fetchPublicEvents() {
  const result = await Result.try({
    try: async () => {
      const response = await fetch("/api/events", { cache: "no-store" });
      if (!response.ok) return { ok: false as const, status: response.status };
      const events: PublicEvent[] = await response.json();
      return { ok: true as const, events };
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("イベントを取得できません", { cause: error }),
  });
  if (Result.isFailure(result)) return result;
  if (!result.value.ok) {
    return Result.fail(new Error(`イベントを取得できません (${result.value.status})`));
  }
  return Result.succeed(result.value.events);
}

export function fetchPublicEvent(eventId: number): Promise<Result.Result<PublicEvent, Error>> {
  const cached = eventCache.get(eventId);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  let entry!: CachedEvent;
  const request = (async () => {
    const result = await loadPublicEvent(eventId);
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

async function loadPublicEvent(eventId: number) {
  const result = await Result.try({
    try: async () => {
      const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
      if (!response.ok) return { ok: false as const, status: response.status };
      const event: PublicEvent = await response.json();
      return { ok: true as const, event };
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("イベントを取得できません", { cause: error }),
  });
  if (Result.isFailure(result)) return result;
  if (!result.value.ok) {
    return Result.fail(new Error(`イベントを取得できません (${result.value.status})`));
  }
  return Result.succeed(result.value.event);
}

export function invalidatePublicEvent(eventId: number) {
  eventCache.delete(eventId);
}
