import runtime from "../../build/public/worker-runtime.mjs";

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
    if (url.pathname.startsWith("/admin-api/")) {
      if (!env.ADMIN) return Response.json({ error: "admin_unavailable" }, { status: 502 });
      url.pathname = url.pathname.replace(/^\/admin-api/, "");
      return env.ADMIN.fetch(new Request(url, request));
    }
    if (isPublicAPI(url.pathname, request.method)) return runtime.fetch(request, env, ctx);
    if (!env.ASSETS) return new Response("Not found", { status: 404 });
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      if (url.pathname.startsWith("/admin/assets/")) return env.ASSETS.fetch(request);
      url.pathname = "/admin/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    if (url.pathname.startsWith("/events/") && !url.pathname.split("/").at(-1)?.includes(".")) {
      const eventId = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      if (/^\d+$/.test(eventId)) {
        url.pathname = `/events/${eventId}/index.html`;
        const staticPage = await env.ASSETS.fetch(new Request(url, request));
        if (staticPage.status !== 404) return staticPage;
      }
      url.pathname = "/events/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    if (url.pathname === "/") url.pathname = "/index.html";
    else if (url.pathname === "/tickets" || url.pathname === "/tickets/") url.pathname = "/tickets/index.html";
    else if (url.pathname === "/events" || url.pathname === "/events/") url.pathname = "/events/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
