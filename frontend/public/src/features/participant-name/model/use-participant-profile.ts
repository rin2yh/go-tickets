import { useEffect, useState } from "react";
import { Result } from "@praha/byethrow";

type ProfileState =
  | { status: "loading" }
  | { status: "loaded"; name: string }
  | { status: "failed"; error: string };

export function useParticipantProfile(getToken: () => Promise<string | null>, enabled: boolean) {
  const [state, setState] = useState<ProfileState>({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    async function load() {
      const result = await fetchParticipantName(getToken);
      if (!active) return;
      if (Result.isSuccess(result)) setState({ status: "loaded", name: result.value });
      else setState({ status: "failed", error: result.error.message });
    }

    void load();
    return () => {
      active = false;
    };
  }, [enabled, getToken]);

  function updateName(name: string) {
    setState({ status: "loaded", name });
  }

  return { state, updateName };
}

async function fetchParticipantName(getToken: () => Promise<string | null>) {
  const token = await Result.try({
    try: () => getToken(),
    catch: (error) =>
      error instanceof Error ? error : new Error("参加者情報を取得できません", { cause: error }),
  });
  if (Result.isFailure(token)) return token;

  const response = await Result.try({
    try: () =>
      fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token.value ?? ""}` },
      }),
    catch: (error) =>
      error instanceof Error ? error : new Error("参加者情報を取得できません", { cause: error }),
  });
  if (Result.isFailure(response)) return response;
  if (!response.value.ok) {
    return Result.fail(new Error(`参加者情報を取得できません (${response.value.status})`));
  }

  return Result.try({
    try: async () => {
      const payload: { name?: string } = await response.value.json();
      return payload.name || "";
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("参加者情報を取得できません", { cause: error }),
  });
}
