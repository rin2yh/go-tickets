import type { Locator, Page } from "@playwright/test";

export class EventDetailPage {
  constructor(private readonly page: Page) {}

  heading(eventName: string): Locator {
    return this.page.getByRole("heading", { name: eventName });
  }

  remainingSeats(count: number): Locator {
    return this.page.getByText(`残席 ${count}`);
  }

  registerButton(ticketName: string): Locator {
    return this.page.getByRole("button", { name: `${ticketName}に申込` });
  }
}
