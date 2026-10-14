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

export function fetchPublicEvents() {
  return Result.pipe(
    Result.try({
      try: () => fetch("/api/events", { cache: "no-store" }),
      catch: (error) =>
        error instanceof Error ? error : new Error("イベントを取得できません", { cause: error }),
    }),
    Result.andThen((response) => {
      if (!response.ok) {
        return Result.fail(new Error(`イベントを取得できません (${response.status})`));
      }

      return Result.try({
        try: async () => {
          const events: PublicEvent[] = await response.json();
          return events;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("イベントを取得できません", { cause: error }),
      });
    }),
  );
}

export function fetchPublicEvent(eventId: number): Promise<Result.Result<PublicEvent, Error>> {
  return loadPublicEvent(eventId);
}

function loadPublicEvent(eventId: number) {
  return Result.pipe(
    Result.try({
      try: () => fetch(`/api/events/${eventId}`, { cache: "no-store" }),
      catch: (error) =>
        error instanceof Error ? error : new Error("イベントを取得できません", { cause: error }),
    }),
    Result.andThen((response) => {
      if (!response.ok) {
        return Result.fail(new Error(`イベントを取得できません (${response.status})`));
      }

      return Result.try({
        try: async () => {
          const event: PublicEvent = await response.json();
          return event;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("イベントを取得できません", { cause: error }),
      });
    }),
  );
}
