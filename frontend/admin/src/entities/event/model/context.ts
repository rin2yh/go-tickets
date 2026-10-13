import { createContext, useContext } from "react";
import type { Event } from "./event";

const eventContext = createContext<Event | null>(null);

export const EventProvider = eventContext.Provider;

export function useEvent() {
  const event = useContext(eventContext);
  if (!event) throw new Error("Event context is unavailable");
  return event;
}
