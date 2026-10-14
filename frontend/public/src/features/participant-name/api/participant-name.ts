import { Result } from "@praha/byethrow";

type TokenGetter = () => Promise<string | null>;

export async function fetchParticipantName(getToken: TokenGetter) {
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

export async function saveParticipantName(getToken: TokenGetter, name: string) {
  const response = await Result.try({
    try: async () => {
      const token = await getToken();
      return await fetch("/api/profile", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("保存に失敗しました", { cause: error }),
  });
  if (Result.isFailure(response)) return response;
  if (!response.value.ok) return Result.fail(new Error("参加者名を保存できません"));

  return Result.try({
    try: async () => {
      const payload: { name: string } = await response.value.json();
      return payload.name;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("保存に失敗しました", { cause: error }),
  });
}
