import { Result } from "@praha/byethrow";

type TokenGetter = () => Promise<string | null>;

export interface MyRegistration {
  ticket_type_id: number;
  event_name: string;
  ticket_name: string;
  status: "active" | "cancelled";
}

export function loadRegistrations(getToken: TokenGetter) {
  return Result.pipe(
    Result.try({
      try: () => getToken(),
      catch: (error) =>
        error instanceof Error ? error : new Error("申込状態を取得できません", { cause: error }),
    }),
    Result.andThen((token) => {
      if (!token) {
        return Result.fail(new Error("申込状態を取得できません。ページを再読み込みしてください。"));
      }

      return fetchRegistrations(token, "申込状態を取得できません");
    }),
  );
}

function fetchRegistrations(token: string, failureMessage: string) {
  return Result.pipe(
    Result.try({
      try: () =>
        fetch("/api/registrations", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      catch: (error) =>
        error instanceof Error ? error : new Error(failureMessage, { cause: error }),
    }),
    Result.andThen((response) => {
      if (!response.ok) {
        return Result.fail(new Error(`申込を取得できません (${response.status})`));
      }

      return Result.try({
        try: async () => {
          const registrations: MyRegistration[] = await response.json();
          return registrations;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error(failureMessage, { cause: error }),
      });
    }),
  );
}

export function submitRegistration(
  getToken: TokenGetter,
  action: "register" | "cancel",
  ticketTypeId: number,
) {
  return Result.pipe(
    Result.try({
      try: () => getToken(),
      catch: (error) =>
        error instanceof Error ? error : new Error("通信に失敗しました", { cause: error }),
    }),
    Result.andThen((token) =>
      Result.pipe(
        Result.try({
          try: () =>
            fetch(action === "register" ? "/api/registrations" : "/api/registrations/cancel", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token ?? ""}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ ticket_type_id: ticketTypeId }),
            }),
          catch: (error) =>
            error instanceof Error ? error : new Error("通信に失敗しました", { cause: error }),
        }),
        Result.andThen((response) => {
          const payload = Result.try({
            try: async () => {
              const result: { error?: string; status?: string } = await response.json();
              return result;
            },
            catch: (error) =>
              error instanceof Error ? error : new Error("通信に失敗しました", { cause: error }),
          });

          if (!response.ok) {
            return Result.pipe(
              payload,
              Result.orElse(() => Result.succeed(undefined)),
              Result.andThen((result) =>
                Result.fail(new Error(registrationError(response.status, result?.error))),
              ),
            );
          }

          return Result.pipe(
            payload,
            Result.map((result) => ({ token, status: result.status })),
          );
        }),
      ),
    ),
  );
}

export async function refreshRegistrations(
  token: string | null,
): Promise<Result.Result<MyRegistration[] | null, Error>> {
  if (!token) return Result.succeed(null);
  return fetchRegistrations(token, "申込を取得できません");
}

function registrationError(status: number, code?: string) {
  const messages: Record<string, string> = {
    participant_name_required: "チケットを申し込む前に参加者名を設定してください。",
    registration_not_started: "受付前です。受付開始日時をご確認ください。",
    registration_ended: "受付は終了しました。",
    event_ended: "イベント終了後はお申し込みできません。",
    sold_out: "このチケットは満席です。",
    duplicate_registration: "このチケットにはすでにお申し込み済みです。",
    event_unpublished: "このイベントは現在公開されていません。",
  };
  return (code && messages[code]) || `${status}: ${code ?? "request_failed"}`;
}
