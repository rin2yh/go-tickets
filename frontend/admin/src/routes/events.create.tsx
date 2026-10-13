import { createFileRoute } from "@tanstack/react-router";
import { Events } from "../pages/event-create";

export const Route = createFileRoute("/events/create")({ component: Events });
