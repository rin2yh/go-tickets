import { clerk } from "@clerk/testing/playwright";
import { expect } from "@playwright/test";
import { test } from "../fixtures/clerk-fixtures";
import { EventDetailPage } from "../pages/event-detail-page";
import { EventListPage } from "../pages/event-list-page";
import { MyTicketsPage } from "../pages/my-tickets-page";

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
    await page.getByRole("link", { name: "自分のチケット" }).click();
    await expect(page.getByText("ログイン中")).toBeVisible();
    expect(authConfigRequests).toBe(1);
    await page.getByRole("link", { name: "Go Tickets" }).click();
    await eventList.openEvent(eventName);
    await expect(page.getByText("ログイン中")).toBeVisible();
    expect(authConfigRequests).toBe(1);
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
    await eventList.goto();
    const requestsBeforeEventNavigation = authConfigRequests;
    await eventList.openEvent(eventName);
    await expect(eventDetail.remainingSeats(1)).toBeVisible();
    expect(authConfigRequests).toBe(requestsBeforeEventNavigation);
  });
});
