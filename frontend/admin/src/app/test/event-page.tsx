import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import type * as Clerk from "@clerk/react";
import { afterEach, vi } from "vitest";
import { routeTree } from "../../routeTree.gen";

const auth = vi.hoisted(() => ({ getToken: vi.fn(async () => "token") }));

vi.mock("@clerk/react", async (importOriginal) => {
  const actual = await importOriginal<typeof Clerk>();
  return {
    ...actual,
    useAuth: () => ({ getToken: auth.getToken, isLoaded: true, isSignedIn: true }),
    UserButton: () => null,
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

export const event = {
  id: 42,
  name: "Go Conference",
  description: "Conference description",
  starts_at: null,
  ends_at: null,
  venue_name: null,
  venue_address: null,
  publication_status: "draft",
  ticket_types: [],
};

export async function renderEventPage(initialEntry = "/events/42") {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
