import { createFileRoute } from "@tanstack/react-router";
import { EventLayout } from "../pages/event-detail/ui/event-detail";

export const Route = createFileRoute("/events/$eventId")({
  // oxlint-disable-next-line no-restricted-types
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "tickets" ? ("tickets" as const) : ("basic" as const),
  }),
  component: EventDetailRoute,
});

function EventDetailRoute() {
  return <EventLayout eventId={Route.useParams().eventId} tab={Route.useSearch().tab} />;
}
