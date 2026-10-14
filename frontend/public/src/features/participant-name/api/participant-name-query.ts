import { queryOptions } from "@tanstack/react-query";
import { Result } from "@praha/byethrow";
import { fetchParticipantName } from "./participant-name";

export const participantNameKey = (userId: string) => ["participant-name", userId] as const;

export const participantNameQueryOptions = (
  userId: string,
  getToken: () => Promise<string | null>,
) =>
  queryOptions({
    queryKey: participantNameKey(userId),
    queryFn: async () => {
      const result = await fetchParticipantName(getToken);
      if (Result.isFailure(result)) throw result.error;
      return result.value;
    },
  });
