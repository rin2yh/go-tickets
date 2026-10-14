import { Result } from "@praha/byethrow";

export async function fetchClerkKey() {
  const response = await Result.try({
    try: () => fetch("/api/auth/config"),
    catch: (error) =>
      error instanceof Error ? error : new Error("認証設定を取得できません", { cause: error }),
  });
  if (Result.isFailure(response)) return response;
  if (!response.value.ok) {
    return Result.fail(new Error(`認証設定を取得できません (${response.value.status})`));
  }

  return Result.try({
    try: async () => {
      const config: { publishableKey: string } = await response.value.json();
      return config.publishableKey;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("認証設定を取得できません", { cause: error }),
  });
}
