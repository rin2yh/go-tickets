import { describe, expect, it } from "vitest";
import { loadEvent, type EventLoadResult } from "./load-event";

interface TestEvent {
  id: number;
  name: string;
}

const event: TestEvent = { id: 42, name: "Go Conference" };

const cases: {
  name: string;
  request: typeof fetch;
  expected: EventLoadResult<TestEvent>;
}[] = [
  {
    name: "404は not-found を返す",
    request: async () => new Response(null, { status: 404 }),
    expected: { status: "not-found" },
  },
  {
    name: "404以外のHTTPエラーは error を返す",
    request: async () => new Response(null, { status: 500 }),
    expected: { status: "error" },
  },
  {
    name: "通信障害は error を返す",
    request: async () => {
      throw new TypeError("network unavailable");
    },
    expected: { status: "error" },
  },
  {
    name: "成功時はイベントを返し、認証情報を付ける",
    request: async (input, init) => {
      expect(input).toBe("/api/admin/events/42");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token");
      return Response.json(event);
    },
    expected: { status: "success", event },
  },
];

describe("loadEvent", () => {
  it.each(cases)("$name", async ({ request, expected }) => {
    const result = await loadEvent<TestEvent>("42", async () => "token", request);

    expect(result).toEqual(expected);
  });
});
