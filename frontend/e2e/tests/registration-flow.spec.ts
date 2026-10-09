import { clerk } from "@clerk/testing/playwright";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "../fixtures/clerk-fixtures";
import { EventDetailPage } from "../pages/event-detail-page";
import { EventListPage } from "../pages/event-list-page";
import { MyTicketsPage } from "../pages/my-tickets-page";

async function expectSignedIn(page: Page) {
  const main = page.getByRole("main");
  await expect(main.getByText("ログイン中")).toBeVisible();
  await expect(main.getByText(/認証を読み込んでいます…|ログイン状態を確認しています…/)).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);
}

test("participant uses tickets across authenticated page transitions", async ({ page }) => {
  const eventName = "Go Conference Local Test";
  const ticketName = "Free Local Test";
  const eventList = new EventListPage(page);
  const eventDetail = new EventDetailPage(page);
  const myTickets = new MyTicketsPage(page);

  await test.step("Open the event and sign in", async () => {
    await eventList.goto();
    await expect(eventList.heading).toBeVisible();
    await eventList.openEvent(eventName);
    await expect(eventDetail.heading(eventName)).toBeVisible();
    await clerk.loaded({ page });
    await clerk.signIn({ page, emailAddress: "go-tickets-e2e+clerk_test@example.com" });
    await expectSignedIn(page);
  });

  await test.step("Keep the signed-in experience across navigation and history", async () => {
    await myTickets.goto();
    await expect(page.getByRole("heading", { name: "自分のチケット" })).toBeVisible();
    await expectSignedIn(page);

    await page.goBack();
    await expect(eventDetail.heading(eventName)).toBeVisible();
    await expectSignedIn(page);

    await page.goForward();
    await expect(page.getByRole("heading", { name: "自分のチケット" })).toBeVisible();
    await expectSignedIn(page);

    await page.getByRole("link", { name: "Go Tickets" }).click();
    await expect(eventList.heading).toBeVisible();
    await eventList.openEvent(eventName);
    await expect(eventDetail.heading(eventName)).toBeVisible();
    await expectSignedIn(page);
  });

  await test.step("Register and cancel a ticket", async () => {
    await eventDetail.registerButton(ticketName).click();
    await expect(page.getByText("registered")).toBeVisible();
    await eventDetail.registerButton(ticketName).click();
    await expect(page.getByText("409: duplicate_registration")).toBeVisible();

    await myTickets.goto();
    await expect(myTickets.registration(eventName, ticketName, "active")).toBeVisible();
    await expectSignedIn(page);
    await myTickets.cancelButton(eventName, ticketName).click();
    await expect(myTickets.registration(eventName, ticketName, "cancelled")).toBeVisible();
  });

  await test.step("Reload, then use browser history again", async () => {
    await page.reload();
    await expect(myTickets.registration(eventName, ticketName, "cancelled")).toBeVisible();
    await expectSignedIn(page);
    await page.goBack();
    await expect(eventDetail.heading(eventName)).toBeVisible();
    await expectSignedIn(page);
    await page.goForward();
    await expect(page.getByRole("heading", { name: "自分のチケット" })).toBeVisible();
    await expectSignedIn(page);
  });
});
