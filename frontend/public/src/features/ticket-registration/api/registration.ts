import { Result } from "@praha/byethrow";

type TokenGetter = () => Promise<string | null>;

export interface MyRegistration {
  ticket_type_id: number;
  event_name: string;
  ticket_name: string;
  status: "active" | "cancelled";
}

export async function loadRegistrations(getToken: TokenGetter) {
  const token = await Result.try({
    try: () => getToken(),
    catch: (error) =>
      error instanceof Error ? error : new Error("申込状態を取得できません", { cause: error }),
  });
  if (Result.isFailure(token)) return token;
  if (!token.value) {
    return Result.fail(new Error("申込状態を取得できません。ページを再読み込みしてください。"));
  }

  const response = await Result.try({
    try: () =>
      fetch("/api/registrations", {
        headers: { Authorization: `Bearer ${token.value}` },
      }),
    catch: (error) =>
      error instanceof Error ? error : new Error("申込状態を取得できません", { cause: error }),
  });
  if (Result.isFailure(response)) return response;
  if (!response.value.ok) {
    return Result.fail(new Error(`申込を取得できません (${response.value.status})`));
  }

  return Result.try({
    try: async () => {
      const registrations: MyRegistration[] = await response.value.json();
      return registrations;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("申込状態を取得できません", { cause: error }),
  });
}

export async function submitRegistration(
  getToken: TokenGetter,
  action: "register" | "cancel",
  ticketTypeId: number,
) {
  const token = await Result.try({
    try: () => getToken(),
    catch: (error) =>
      error instanceof Error ? error : new Error("通信に失敗しました", { cause: error }),
  });
  if (Result.isFailure(token)) return token;

  const response = await Result.try({
    try: () =>
      fetch(action === "register" ? "/api/registrations" : "/api/registrations/cancel", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.value ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticket_type_id: ticketTypeId }),
      }),
    catch: (error) =>
      error instanceof Error ? error : new Error("通信に失敗しました", { cause: error }),
  });
  if (Result.isFailure(response)) return response;

  const payload = await Result.try({
    try: async () => {
      const result: { error?: string; status?: string } = await response.value.json();
      return result;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("通信に失敗しました", { cause: error }),
  });
  if (!response.value.ok) {
    if (Result.isFailure(payload)) {
      return Result.fail(new Error(registrationError(response.value.status)));
    }
    return Result.fail(new Error(registrationError(response.value.status, payload.value.error)));
  }
  if (Result.isFailure(payload)) return payload;
  return Result.succeed({ token: token.value, status: payload.value.status });
}

export async function refreshRegistrations(
  token: string | null,
): Promise<Result.Result<MyRegistration[] | null, Error>> {
  if (!token) return Result.succeed(null);
  const response = await Result.try({
    try: () =>
      fetch("/api/registrations", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    catch: (error) =>
      error instanceof Error ? error : new Error("申込を取得できません", { cause: error }),
  });
  if (Result.isFailure(response)) return response;
  if (!response.value.ok) {
    return Result.fail(new Error(`申込を取得できません (${response.value.status})`));
  }

  return Result.try({
    try: async () => {
      const registrations: MyRegistration[] = await response.value.json();
      return registrations;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("申込を取得できません", { cause: error }),
  });
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
