import { Result } from "@praha/byethrow";

type TokenGetter = () => Promise<string | null>;

export function fetchParticipantName(getToken: TokenGetter) {
  return Result.pipe(
    Result.try({
      try: () => getToken(),
      catch: (error) =>
        error instanceof Error ? error : new Error("参加者情報を取得できません", { cause: error }),
    }),
    Result.andThen((token) =>
      Result.try({
        try: () =>
          fetch("/api/profile", {
            headers: { Authorization: `Bearer ${token ?? ""}` },
          }),
        catch: (error) =>
          error instanceof Error
            ? error
            : new Error("参加者情報を取得できません", { cause: error }),
      }),
    ),
    Result.andThen((response) => {
      if (!response.ok) {
        return Result.fail(new Error(`参加者情報を取得できません (${response.status})`));
      }

      return Result.try({
        try: async () => {
          const payload: { name?: string } = await response.json();
          return payload.name || "";
        },
        catch: (error) =>
          error instanceof Error
            ? error
            : new Error("参加者情報を取得できません", { cause: error }),
      });
    }),
  );
}

export function saveParticipantName(getToken: TokenGetter, name: string) {
  return Result.pipe(
    Result.try({
      try: async () => {
        const token = await getToken();
        return fetch("/api/profile", {
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
    }),
    Result.andThen((response) => {
      if (!response.ok) return Result.fail(new Error("参加者名を保存できません"));

      return Result.try({
        try: async () => {
          const payload: { name: string } = await response.json();
          return payload.name;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("保存に失敗しました", { cause: error }),
      });
    }),
  );
}
