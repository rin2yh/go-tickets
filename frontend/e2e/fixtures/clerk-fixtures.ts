import { createClerkClient } from "@clerk/backend";
import { clerkSetup as initializeClerk } from "@clerk/testing/playwright";
import { test as base } from "@playwright/test";

export const test = base.extend<{}, { clerkSetup: void }>({
  clerkSetup: [
    async (_fixtures, use) => {
      await initializeClerk({
        publishableKey: "pk_test_cGxlYXNpbmctc3F1aWQtNzE4OS5jbGVyay5hY2NvdW50cy5kZXYk",
      });

      const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
      const emailAddress = "go-tickets-e2e+clerk_test@example.com";
      const { data } = await clerkClient.users.getUserList({ emailAddress: [emailAddress] });
      if (data.length === 0) {
        await clerkClient.users.createUser({
          emailAddress: [emailAddress],
          firstName: "Go Tickets",
          lastName: "E2E",
          skipPasswordRequirement: true,
        });
      }

      await use();
    },
    { scope: "worker", auto: true },
  ],
});
