// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import type * as Clerk from "@clerk/react";
import { afterEach, expect, it, vi } from "vitest";
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

it("keeps the registration capacity values when capacity is zero", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const event = {
    id: 42,
    name: "Go Conference",
    starts_at: null,
    publication_status: "draft",
    ticket_types: [],
  };
  const page = { items: [], total: 0, active: 0, cancelled: 0, capacity: 0 };
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    String(input).includes("/registrations?")
      ? Promise.resolve(Response.json(page))
      : Promise.resolve(Response.json(event)),
  );
  vi.stubGlobal("fetch", fetchMock);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/events/42/registrations?status=cancelled&ticket=all&page=1"],
    }),
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  const progress = await screen.findByRole("progressbar", { name: "参加者の申込状況" });
  expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
    expect.arrayContaining([
      expect.stringContaining("/registrations?status=cancelled&ticket=all&page=1"),
    ]),
  );
  expect(progress.firstElementChild?.getAttribute("style")).toContain("translateX(-100%)");
  expect(screen.getByText("0 / 0名")).toBeTruthy();

  const ticketFilter = screen.getByLabelText("チケット種別");
  expect(ticketFilter.tagName).toBe("SELECT");
  expect(ticketFilter).toHaveProperty("value", "all");
  const registrationTab = screen.getByRole("link", { name: "参加者" });
  expect(registrationTab.getAttribute("aria-current")).toBe("page");
  expect(registrationTab.getAttribute("href")).toContain(
    "/events/42/registrations?tab=basic&status=cancelled&ticket=all&page=1",
  );
  expect(screen.getByRole("link", { name: "基本情報" }).getAttribute("href")).toContain(
    "/events/42?tab=basic",
  );
});
