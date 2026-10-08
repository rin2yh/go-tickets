import runtime from "../../build/public/worker-runtime.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/auth/config" && request.method === "GET") {
      return Response.json({ publishableKey: env.CLERK_PUBLISHABLE_KEY });
    }
    if (url.pathname === "/health") return runtime.fetch(request, env, ctx);
    if ((url.pathname === "/registrations" || url.pathname === "/registrations/cancel") && request.method === "POST") {
      return runtime.fetch(request, env, ctx);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
