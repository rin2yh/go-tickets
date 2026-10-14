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
  const response = await Result.try({
    try: () => fetch("/api/auth/config"),
    catch: (error) =>
      error instanceof Error ? error : new Error("認証を初期化できません", { cause: error }),
  });
  if (Result.isFailure(response)) {
    root.render(<p role="alert">{response.error.message}</p>);
    return;
  }
  if (!response.value.ok) {
    root.render(<p role="alert">Clerk設定を取得できません ({response.value.status})</p>);
    return;
  }
  const config = await Result.try({
    try: async () => {
      const authConfig: { publishableKey: string } = await response.value.json();
      return authConfig;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("認証を初期化できません", { cause: error }),
  });
  if (Result.isFailure(config)) {
    root.render(<p role="alert">{config.error.message}</p>);
    return;
  }
  root.render(
    <ClerkProvider publishableKey={config.value.publishableKey}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ClerkProvider>,
  );
}
void start();
