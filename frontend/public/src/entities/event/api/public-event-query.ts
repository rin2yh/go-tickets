import { queryOptions } from "@tanstack/react-query";
import { Result } from "@praha/byethrow";
import { fetchPublicEvent, fetchPublicEvents } from "./public-event";

export const publicEventKeys = {
  all: ["public-events"] as const,
  lists: () => [...publicEventKeys.all, "list"] as const,
  details: () => [...publicEventKeys.all, "detail"] as const,
  detail: (eventId: number) => [...publicEventKeys.details(), eventId] as const,
};

export const publicEventsQueryOptions = () =>
  queryOptions({
    queryKey: publicEventKeys.lists(),
    queryFn: async () => {
      const result = await fetchPublicEvents();
      if (Result.isFailure(result)) throw result.error;
      return result.value;
    },
  });

export const publicEventQueryOptions = (eventId: number) =>
  queryOptions({
    queryKey: publicEventKeys.detail(eventId),
    queryFn: async () => {
      const result = await fetchPublicEvent(eventId);
      if (Result.isFailure(result)) throw result.error;
      return result.value;
    },
  });
