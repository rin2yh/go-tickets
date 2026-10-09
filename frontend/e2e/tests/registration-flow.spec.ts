import { clerk } from "@clerk/testing/playwright";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "../fixtures/clerk-fixtures";
import { EventDetailPage } from "../pages/event-detail-page";
import { EventListPage } from "../pages/event-list-page";
import { MyTicketsPage } from "../pages/my-tickets-page";

declare global {
  interface Window {
    e2eAuthUxUnexpected?: string[];
    e2eAuthUxObserver?: MutationObserver;
  }
}

async function expectAuthenticatedSurface(page: Page, requirePersistedNode = true) {
  const main = page.getByRole("main");
  const persistedIsland = page.locator('astro-island[data-astro-transition-persist="clerk-auth"]');
  await expect(main.getByText("ログイン中")).toBeVisible();
  await expect(page.getByTestId("public-sign-in")).toHaveCount(0);
  await expect(main.getByText(/認証を読み込んでいます…|ログイン状態を確認しています…/)).toHaveCount(
    0,
  );
  await expect(persistedIsland).toHaveCount(1);
  expect(await persistedIsland.evaluate((element) => element.closest("main") !== null)).toBe(true);
  if (requirePersistedNode) {
    await expect(persistedIsland).toHaveAttribute("data-e2e-persisted", "original");
  }
}

test("participant registers for a ticket and sees the result in My Tickets", async ({ page }) => {
  const eventName = "Go Conference Local Test";
  const ticketName = "Free Local Test";
  const eventList = new EventListPage(page);
  const eventDetail = new EventDetailPage(page);
  const myTickets = new MyTicketsPage(page);
  let authConfigRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/config") authConfigRequests += 1;
  });

  await test.step("Open the event", async () => {
    await eventList.goto();
    await expect(eventList.heading).toBeVisible();
    await eventList.openEvent(eventName);
    await expect(eventDetail.heading(eventName)).toBeVisible();
    await expect(eventDetail.remainingSeats(1)).toBeVisible();
    await expect.poll(() => authConfigRequests).toBe(1);
    await page.getByRole("link", { name: "自分のチケット" }).click();
    await expect(page.getByRole("heading", { name: "自分のチケット" })).toBeVisible();
    expect(authConfigRequests).toBe(1);
    await page.getByRole("link", { name: "Go Tickets" }).click();
    await eventList.openEvent(eventName);
    await expect(eventDetail.heading(eventName)).toBeVisible();
    expect(authConfigRequests).toBe(1);
  });

  await test.step("Sign in and register", async () => {
    await clerk.loaded({ page });
    await clerk.signIn({ page, emailAddress: "go-tickets-e2e+clerk_test@example.com" });
    await expect(page.getByText("ログイン中")).toBeVisible();
    const persistedIsland = page.locator(
      'astro-island[data-astro-transition-persist="clerk-auth"]',
    );
    await persistedIsland.evaluate((element) =>
      element.setAttribute("data-e2e-persisted", "original"),
    );
    await page.evaluate(() => {
      const unexpected: string[] = [];
      const loadingText = /認証を読み込んでいます…|ログイン状態を確認しています…/;
      const inspect = (records: MutationRecord[]) => {
        for (const record of records) {
          const nodes = [...record.addedNodes, record.target];
          for (const node of nodes) {
            if (!(node instanceof Element)) continue;
            if (
              node.matches('[data-testid="public-sign-in"]') ||
              node.querySelector('[data-testid="public-sign-in"]')
            ) {
              unexpected.push("SignIn appeared after successful sign-in");
            }
            if (loadingText.test(node.textContent ?? "")) {
              unexpected.push("Authentication loading UI appeared during an app navigation");
            }
          }
        }
      };
      window.e2eAuthUxUnexpected = unexpected;
      window.e2eAuthUxObserver = new MutationObserver(inspect);
      window.e2eAuthUxObserver.observe(document.querySelector("main")!, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    await page.getByRole("link", { name: "自分のチケット" }).click();
    await expect(page.getByRole("heading", { name: "自分のチケット" })).toBeVisible();
    await expectAuthenticatedSurface(page);
    expect(authConfigRequests).toBe(1);
    await page.goBack();
    await expect(eventDetail.heading(eventName)).toBeVisible();
    await expectAuthenticatedSurface(page);
    await page.goForward();
    await expect(page.getByRole("heading", { name: "自分のチケット" })).toBeVisible();
    await expectAuthenticatedSurface(page);
    await page.getByRole("link", { name: "Go Tickets" }).click();
    await eventList.openEvent(eventName);
    await expect(eventDetail.heading(eventName)).toBeVisible();
    await expectAuthenticatedSurface(page);
    expect(authConfigRequests).toBe(1);
    expect(await page.evaluate(() => window.e2eAuthUxUnexpected)).toEqual([]);
    await page.evaluate(() => window.e2eAuthUxObserver?.disconnect());
    await eventDetail.registerButton(ticketName).click();
    await expect(page.getByText("registered")).toBeVisible();
    await eventDetail.registerButton(ticketName).click();
    await expect(page.getByText("409: duplicate_registration")).toBeVisible();
  });

  await test.step("Cancel the ticket and verify the reservation counter", async () => {
    await myTickets.goto();
    await expect(myTickets.registration(eventName, ticketName, "active")).toBeVisible();
    expect(authConfigRequests).toBe(1);
    await myTickets.cancelButton(eventName, ticketName).click();
    await expect(myTickets.registration(eventName, ticketName, "cancelled")).toBeVisible();
    await page.reload();
    await expect(myTickets.registration(eventName, ticketName, "cancelled")).toBeVisible();
    await expectAuthenticatedSurface(page, false);
    const requestsBeforeListReload = authConfigRequests;
    await eventList.goto();
    await expect.poll(() => authConfigRequests).toBe(requestsBeforeListReload + 1);
    const requestsBeforeEventNavigation = authConfigRequests;
    await eventList.openEvent(eventName);
    await expect(eventDetail.remainingSeats(1)).toBeVisible();
    expect(authConfigRequests).toBe(requestsBeforeEventNavigation);
  });
});
