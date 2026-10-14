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
  const config = await Result.try({
    try: async () => {
      const response = await fetch("/api/auth/config");
      if (!response.ok) return { ok: false as const, status: response.status };
      const authConfig: { publishableKey: string } = await response.json();
      return { ok: true as const, config: authConfig };
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("認証を初期化できません", { cause: error }),
  });
  if (Result.isFailure(config)) {
    root.render(<p role="alert">{config.error.message}</p>);
    return;
  }
  if (!config.value.ok) {
    root.render(<p role="alert">Clerk設定を取得できません ({config.value.status})</p>);
    return;
  }
  root.render(
    <ClerkProvider publishableKey={config.value.config.publishableKey}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ClerkProvider>,
  );
}
void start();
