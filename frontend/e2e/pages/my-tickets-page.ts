import type { Locator, Page } from "@playwright/test";

export class MyTicketsPage {
  constructor(private readonly page: Page) {}

  registration(eventName: string, ticketName: string, status: string): Locator {
    const statusLabel = status === "active" ? "申込中" : "キャンセル済み";
    return this.page
      .getByRole("listitem")
      .filter({ hasText: eventName })
      .filter({ hasText: ticketName })
      .filter({ hasText: statusLabel });
  }

  async goto() {
    await this.page.getByRole("link", { name: "自分のチケット" }).click();
  }
}
