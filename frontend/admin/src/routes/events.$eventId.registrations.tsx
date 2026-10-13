import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Registrations } from "../pages/event-registrations";

export const Route = createFileRoute("/events/$eventId/registrations")({
  // oxlint-disable-next-line no-restricted-types
  validateSearch: (search: Record<string, unknown>) => ({
    status: search.status === "cancelled" ? ("cancelled" as const) : ("active" as const),
    ticket: typeof search.ticket === "string" ? search.ticket : "all",
    page: Math.max(1, Number(search.page) || 1),
  }),
  component: EventRegistrationsRoute,
});
function EventRegistrationsRoute() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <Registrations
      eventId={eventId}
      {...search}
      onSearchChange={(next) => void navigate({ search: (old) => ({ ...old, ...next }) })}
    />
  );
}
