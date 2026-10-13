import { createFileRoute } from "@tanstack/react-router";
import { BasicInformation } from "../pages/event-basic";

export const Route = createFileRoute("/events/$eventId/")({ component: EventBasicRoute });
function EventBasicRoute() {
  return <BasicInformation eventId={Route.useParams().eventId} />;
}
