import runtime from "../../build/public/worker-runtime.mjs";
import { fetchStaticAsset } from "./assets.mjs";

function isPublicAPI(path, method) {
  return (path === "/health" && method === "GET")
    || ((path === "/api/events" || /^\/api\/events\/[^/]+$/.test(path)) && method === "GET")
    || (path === "/registrations" && (method === "GET" || method === "POST"))
    || (path === "/registrations/cancel" && method === "POST");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/auth/config" && request.method === "GET") {
      return Response.json({ publishableKey: env.CLERK_PUBLISHABLE_KEY });
    }
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      if (!env.ADMIN) return Response.json({ error: "admin_unavailable" }, { status: 502 });
      return env.ADMIN.fetch(request);
    }
    if (url.pathname.startsWith("/admin-api/")) {
      if (!env.ADMIN) return Response.json({ error: "admin_unavailable" }, { status: 502 });
      url.pathname = url.pathname.replace(/^\/admin-api/, "");
      return env.ADMIN.fetch(new Request(url, request));
    }
    if (isPublicAPI(url.pathname, request.method)) return runtime.fetch(request, env, ctx);
    return fetchStaticAsset(request, env);
  },
};
