import runtime from "../../build/public/worker-runtime.mjs";
import { verifyRequest, unauthorized, requestAsUser } from "../../internal/auth/auth.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/auth/config" && request.method === "GET") {
      return Response.json({ publishableKey: env.CLERK_PUBLISHABLE_KEY });
    }
    if (url.pathname === "/health") return runtime.fetch(request, env, ctx);
    if (url.pathname === "/admin/health") return env.ADMIN.fetch(new Request(new URL("/health", request.url), request));
    if (url.pathname === "/ticket-types/1/status" && request.method === "GET") {
      const user = await verifyRequest(request, env);
      if (!user) return unauthorized();
      return env.ADMIN.fetch(requestAsUser(request, user));
    }
    if ((url.pathname === "/registrations" || url.pathname === "/registrations/cancel") && request.method === "POST") {
      const user = await verifyRequest(request, env);
      if (!user) return unauthorized();
      return runtime.fetch(requestAsUser(request, user), env, ctx);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
