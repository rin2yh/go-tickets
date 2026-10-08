import runtime from "../../build/admin/worker-runtime.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return runtime.fetch(request, env, ctx);
    if (url.pathname === "/ticket-types/1/status" && request.method === "GET") {
      return runtime.fetch(request, env, ctx);
    }
    return new Response("Not found", { status: 404 });
  },
};
