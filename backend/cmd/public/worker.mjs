import runtime from "../../build/public/worker-runtime.mjs";
import { fetchStaticAsset } from "./assets.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      return runtime.fetch(request, env, ctx);
    }
    return fetchStaticAsset(request, env);
  },
};
