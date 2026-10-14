import { ClerkProvider } from "@clerk/react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
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
  const [response] = await Promise.allSettled([fetch("/api/auth/config")]);
  if (response.status === "rejected") {
    root.render(
      <p role="alert">
        {response.reason instanceof Error ? response.reason.message : "認証を初期化できません"}
      </p>,
    );
    return;
  }
  if (!response.value.ok) {
    root.render(<p role="alert">Clerk設定を取得できません ({response.value.status})</p>);
    return;
  }
  const [configResult] = await Promise.allSettled([response.value.json()]);
  if (configResult.status === "rejected") {
    root.render(
      <p role="alert">
        {configResult.reason instanceof Error
          ? configResult.reason.message
          : "認証を初期化できません"}
      </p>,
    );
    return;
  }
  const config: { publishableKey: string } = configResult.value;
  root.render(
    <ClerkProvider publishableKey={config.publishableKey}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ClerkProvider>,
  );
}
void start();
