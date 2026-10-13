import { createFileRoute } from "@tanstack/react-router";
import { CheckIn } from "../pages/check-in/ui/check-in";

export const Route = createFileRoute("/check-in")({ component: CheckIn });
