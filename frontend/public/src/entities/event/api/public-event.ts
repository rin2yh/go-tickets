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
  return loadPublicEvents();
}

async function settle<T>(promise: Promise<T>): Promise<Result.Result<Awaited<T>, Error>> {
  const [outcome] = await Promise.allSettled([promise]);
  if (outcome.status === "rejected") {
    return Result.fail(
      outcome.reason instanceof Error
        ? outcome.reason
        : new Error("通信に失敗しました", { cause: outcome.reason }),
    );
  }
  return { type: "Success", value: outcome.value };
}

async function loadPublicEvents(): Promise<Result.Result<PublicEvent[], Error>> {
  const response = await settle(fetch("/api/events", { cache: "no-store" }));
  if (Result.isFailure(response)) return response;
  if (!response.value.ok) {
    return Result.fail(new Error(`イベントを取得できません (${response.value.status})`));
  }
  return settle<PublicEvent[]>(response.value.json());
}

export function fetchPublicEvent(eventId: number): Promise<Result.Result<PublicEvent, Error>> {
  const cached = eventCache.get(eventId);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  let entry: { expiresAt: number; request: Promise<Result.Result<PublicEvent, Error>> } | null =
    null;
  const request = (async () => {
    const result = await loadPublicEvent(eventId, () => {
      if (entry && eventCache.get(eventId) === entry) entry.expiresAt = 0;
    });
    return result;
  })();
  entry = { expiresAt: Number.POSITIVE_INFINITY, request };
  eventCache.set(eventId, entry);
  return entry.request;
}

async function loadPublicEvent(
  eventId: number,
  onFailure: () => void,
): Promise<Result.Result<PublicEvent, Error>> {
  const response = await settle(fetch(`/api/events/${eventId}`, { cache: "no-store" }));
  if (Result.isFailure(response)) {
    onFailure();
    return response;
  }
  if (!response.value.ok) {
    onFailure();
    return Result.fail(new Error(`イベントを取得できません (${response.value.status})`));
  }
  const event = await settle<PublicEvent>(response.value.json());
  if (Result.isFailure(event)) onFailure();
  else {
    const cached = eventCache.get(eventId);
    if (cached) cached.expiresAt = Date.now() + cacheDurationMs;
  }
  return event;
}

export function invalidatePublicEvent(eventId: number) {
  eventCache.delete(eventId);
}
