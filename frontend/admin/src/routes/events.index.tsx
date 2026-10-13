import { createFileRoute } from "@tanstack/react-router";
import { Events } from "../pages/event-list";

export const Route = createFileRoute("/events/")({ component: Events });
