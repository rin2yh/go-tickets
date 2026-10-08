import { clerkSetup } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import { test as setup } from "@playwright/test";

setup.describe.configure({ mode: "serial" });

setup("initialize Clerk testing token", async () => {
  await clerkSetup();

  const emailAddress = process.env.E2E_CLERK_USER_EMAIL!;
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const { data } = await clerkClient.users.getUserList({ emailAddress: [emailAddress] });
  if (data.length === 0) {
    await clerkClient.users.createUser({
      emailAddress: [emailAddress],
      firstName: "Go Tickets",
      lastName: "E2E",
      skipPasswordRequirement: true,
    });
  }
});
