import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

test("participant registers for a ticket and sees the result in My Tickets", async ({ page }) => {
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL;
  if (!emailAddress) throw new Error("Set E2E_CLERK_USER_EMAIL to a Clerk test user email.");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "イベント一覧" })).toBeVisible();
  await page.getByRole("link", { name: "Go Conference Local Test" }).click();

  await expect(page.getByRole("heading", { name: "Go Conference Local Test" })).toBeVisible();
  await expect(page.getByText("残席 1")).toBeVisible();
  await clerk.signIn({ page, emailAddress });

  await page.getByRole("button", { name: "Free Local Testに申込" }).click();
  await expect(page.getByText("registered")).toBeVisible();

  await page.getByRole("link", { name: "自分のチケット" }).click();
  const registration = page.getByText("Go Conference Local Test / Free Local Test / active");
  await expect(registration).toBeVisible();
  await page.reload();
  await expect(registration).toBeVisible();
});
