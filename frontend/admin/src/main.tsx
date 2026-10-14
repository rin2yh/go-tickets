import { ClerkProvider } from "@clerk/react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Result } from "@praha/byethrow";
// oxlint-disable-next-line import/no-unassigned-import
import "@go-tickets/ui/styles.css";

const router = createRouter({
  routeTree,
  basepath: "/",
  trailingSlash: "never",
  scrollRestoration: true,
});
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

async function start() {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("#root is missing");
  const root = createRoot(rootElement);
  const result = await Result.try({
    try: async () => {
      const response = await fetch("/api/auth/config");
      if (!response.ok) throw new Error(`Clerk設定を取得できません (${response.status})`);
      const config: { publishableKey: string } = await response.json();
      root.render(
        <ClerkProvider publishableKey={config.publishableKey}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ClerkProvider>,
      );
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("認証を初期化できません", { cause: error }),
  });
  if (Result.isFailure(result)) {
    root.render(<p role="alert">{result.error.message}</p>);
  }
}
void start();
