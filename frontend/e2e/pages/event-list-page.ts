import type { Locator, Page } from "@playwright/test";

export class EventListPage {
  readonly heading: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "イベント一覧" });
  }

  async goto() {
    await this.page.goto("/");
  }

  async openEvent(name: string) {
    await this.page.getByRole("link", { name }).click();
  }
}
