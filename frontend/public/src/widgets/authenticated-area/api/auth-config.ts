import { Result } from "@praha/byethrow";

export function fetchClerkKey() {
  return Result.pipe(
    Result.try({
      try: () => fetch("/api/auth/config"),
      catch: (error) =>
        error instanceof Error ? error : new Error("認証設定を取得できません", { cause: error }),
    }),
    Result.andThen((response) => {
      if (!response.ok) {
        return Result.fail(new Error(`認証設定を取得できません (${response.status})`));
      }

      return Result.try({
        try: async () => {
          const config: { publishableKey: string } = await response.json();
          return config.publishableKey;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("認証設定を取得できません", { cause: error }),
      });
    }),
  );
}
