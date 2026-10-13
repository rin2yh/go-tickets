import { createFileRoute } from "@tanstack/react-router";
import { Tickets } from "../pages/event-tickets";

export const Route = createFileRoute("/events/$eventId/tickets")({ component: EventTicketsRoute });
function EventTicketsRoute() {
  return <Tickets eventId={Route.useParams().eventId} />;
}
