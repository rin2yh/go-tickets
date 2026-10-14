import { useEffect, useState } from "react";
import { Result } from "@praha/byethrow";
import { fetchPublicEvent, type PublicTicketType } from "../../../entities/event";

type EventTicketsState =
  | { status: "loading" }
  | { status: "loaded"; eventId: number; ticketTypes: PublicTicketType[]; endsAt: string | null }
  | { status: "failed"; eventId: number; error: string };

export function useEventTickets(eventId: number | null): EventTicketsState {
  const [state, setState] = useState<EventTicketsState>({ status: "loading" });

  useEffect(() => {
    if (eventId === null) return;
    const id = eventId;
    let active = true;

    async function load() {
      const result = await fetchPublicEvent(id);
      if (!active) return;
      if (Result.isSuccess(result)) {
        setState({
          status: "loaded",
          eventId: id,
          ticketTypes: result.value.ticket_types,
          endsAt: result.value.ends_at,
        });
      } else setState({ status: "failed", eventId: id, error: result.error.message });
    }

    void load();
    return () => {
      active = false;
    };
  }, [eventId]);

  if (eventId === null) return { status: "loading" };
  if (state.status !== "loading" && state.eventId === eventId) return state;
  return { status: "loading" };
}
