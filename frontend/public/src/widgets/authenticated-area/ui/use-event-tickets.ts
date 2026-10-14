import { useQuery } from "@tanstack/react-query";
import { type PublicTicketType, publicEventQueryOptions } from "../../../entities/event";

type EventTicketsState =
  | { status: "loading" }
  | { status: "loaded"; eventId: number; ticketTypes: PublicTicketType[]; endsAt: string | null }
  | { status: "failed"; eventId: number; error: string; retry: () => void };

export function useEventTickets(eventId: number | null): EventTicketsState {
  const query = useQuery({
    ...publicEventQueryOptions(eventId ?? 0),
    enabled: eventId !== null,
  });
  if (eventId === null || query.isPending) return { status: "loading" };
  if (query.error)
    return {
      status: "failed",
      eventId,
      error: query.error.message,
      retry: () => void query.refetch(),
    };
  if (!query.data) return { status: "loading" };
  return {
    status: "loaded",
    eventId,
    ticketTypes: query.data.ticket_types,
    endsAt: query.data.ends_at,
  };
}
