import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegisterButtons, TicketAvailability } from "./clerk-island";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("受付状態", () => {
  it("初回レンダーで時刻未確定の状態を受付前と誤判定しない", () => {
    const markup = renderToStaticMarkup(
      <TicketAvailability
        registrationStartsAt="2027-12-31T00:00:00Z"
        registrationEndsAt="2028-01-02T00:00:00Z"
        eventEndsAt="2028-01-03T00:00:00Z"
        capacity={10}
        reserved={6}
      />,
    );

    expect(markup).toContain("受付状態を確認中…（残席 4）");
  });

  it("受付中と満席をチケット情報から表示する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-01-01T00:00:00Z"));

    render(
      <>
        <TicketAvailability
          registrationStartsAt="2027-12-31T00:00:00Z"
          registrationEndsAt="2028-01-02T00:00:00Z"
          eventEndsAt="2028-01-03T00:00:00Z"
          capacity={10}
          reserved={6}
        />
        <TicketAvailability
          registrationStartsAt="2027-12-31T00:00:00Z"
          registrationEndsAt="2028-01-02T00:00:00Z"
          eventEndsAt="2028-01-03T00:00:00Z"
          capacity={3}
          reserved={3}
        />
      </>,
    );

    expect(screen.getByText("受付中（残席 4）")).toBeTruthy();
    expect(screen.getByText("満席（残席 0）")).toBeTruthy();
  });

  it("申込履歴を取得し終えるまで申込ボタンを無効にする", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-01-01T00:00:00Z"));

    render(
      <RegisterButtons
        tickets={[
          {
            id: 7,
            name: "General",
            capacity: 10,
            reserved: 0,
            registration_starts_at: "2027-12-31T00:00:00Z",
            registration_ends_at: "2028-01-02T00:00:00Z",
          },
        ]}
        eventEndsAt="2028-01-03T00:00:00Z"
        registrations={[]}
        registrationsReady={false}
        busy={false}
        register={async () => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Generalに申込" }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});
