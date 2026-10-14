import { useQuery, useQueryClient } from "@tanstack/react-query";
import { participantNameKey, participantNameQueryOptions } from "../api/participant-name-query";

type ProfileState =
  | { status: "loading" }
  | { status: "loaded"; name: string }
  | { status: "failed"; error: string };

export function useParticipantProfile(
  getToken: () => Promise<string | null>,
  enabled: boolean,
  userId: string,
) {
  const queryClient = useQueryClient();
  const query = useQuery({ ...participantNameQueryOptions(userId, getToken), enabled });
  const state: ProfileState = query.error
    ? { status: "failed", error: query.error.message }
    : query.data !== undefined
      ? { status: "loaded", name: query.data }
      : { status: "loading" };

  function updateName(name: string) {
    queryClient.setQueryData(participantNameKey(userId), name);
  }

  function retry() {
    void query.refetch();
  }

  return { state, updateName, retry };
}
