import runtime from "../../build/admin/worker-runtime.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      return runtime.fetch(request, env, ctx);
    }
    if (request.method !== "GET" || !env.ASSETS) return new Response("Not found", { status: 404 });
    if (!url.pathname.startsWith("/assets/")) url.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
