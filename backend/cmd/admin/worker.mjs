import runtime from "../../build/admin/worker-runtime.mjs";
import { verifyRequest, unauthorized, requestAsUser } from "../../internal/auth/auth.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return runtime.fetch(request, env, ctx);
    if (url.pathname === "/ticket-types/1/status" && request.method === "GET") {
      const user = await verifyRequest(request, env);
      if (!user) return unauthorized();
      return runtime.fetch(requestAsUser(request, user), env, ctx);
    }
    return new Response("Not found", { status: 404 });
  },
};
