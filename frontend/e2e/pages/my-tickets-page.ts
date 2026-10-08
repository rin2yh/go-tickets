import type { Locator, Page } from "@playwright/test";

export class MyTicketsPage {
  constructor(private readonly page: Page) {}

  registration(eventName: string, ticketName: string, status: string): Locator {
    return this.page.getByText(`${eventName} / ${ticketName} / ${status}`);
  }

  async goto() {
    await this.page.getByRole("link", { name: "自分のチケット" }).click();
  }
}
