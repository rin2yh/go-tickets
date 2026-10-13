import { clerk } from "@clerk/testing/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "../fixtures/clerk-fixtures";

const clerkPublishableKey = "pk_test_cGxlYXNpbmctc3F1aWQtNzE4OS5jbGVyay5hY2NvdW50cy5kZXYk";

const tickets = [
  {
    id: 1,
    name: "Free Local Test",
    capacity: 1,
    reserved: 0,
    registration_starts_at: null,
    registration_ends_at: null,
  },
  {
    id: 2,
    name: "一般",
    capacity: 100,
    reserved: 12,
    registration_starts_at: "2026-10-01T00:00:00Z",
    registration_ends_at: "2026-10-31T00:00:00Z",
  },
];

const event = {
  id: 1,
  name: "Go Conference Local Test",
  description: "",
  starts_at: null,
  ends_at: null,
  venue_name: null,
  venue_address: null,
  publication_status: "draft",
  ticket_types: tickets,
};

const pages = [
  { name: "overview", path: "/", heading: "管理概要" },
  { name: "events", path: "/events", heading: "イベント" },
  { name: "create", path: "/events/create", heading: "イベントを作成" },
  { name: "basic", path: "/events/1", heading: event.name },
  { name: "tickets", path: "/events/1?tab=tickets", heading: "チケット種別" },
  { name: "attendees", path: "/events/1/registrations", heading: "参加者" },
  { name: "checkin", path: "/check-in", heading: "チェックイン" },
] as const;

test("Admin pages match the desktop and mobile VRT references", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/");
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: "go-tickets-e2e+clerk_test@example.com" });
  await expect(page.getByRole("heading", { name: "管理概要" })).toBeVisible();

  for (const viewport of [
    { name: "1440", width: 1440, height: 1000 },
    { name: "375", width: 375, height: 812 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of pages) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();

      await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
        fullPage: true,
      });
    }
  }
});

async function mockAdminApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/config") {
      await route.fulfill({ json: { publishableKey: clerkPublishableKey } });
      return;
    }
    if (url.pathname === "/api/admin/events") {
      await route.fulfill({
        json: [
          {
            id: event.id,
            name: event.name,
            starts_at: event.starts_at,
            publication_status: event.publication_status,
          },
          {
            id: 2,
            name: "管理画面確認用イベント",
            starts_at: "2026-11-01T01:00:00Z",
            publication_status: "draft",
          },
        ],
      });
      return;
    }
    if (url.pathname === "/api/admin/events/1") {
      await route.fulfill({ json: event });
      return;
    }
    if (url.pathname === "/api/admin/events/1/registrations") {
      await route.fulfill({
        json: { items: [], total: 0, active: 0, cancelled: 0, capacity: 101 },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not_found" } });
  });
}
