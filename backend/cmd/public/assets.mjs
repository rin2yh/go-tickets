export async function fetchStaticAsset(request, env) {
  if (!env.ASSETS) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  if (url.pathname.startsWith("/events/") && !url.pathname.split("/").at(-1)?.includes(".")) {
    const eventId = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (!/^\d+$/.test(eventId)) return new Response("Not found", { status: 404 });
    url.pathname = `/events/${eventId}/index.html`;
    return env.ASSETS.fetch(new Request(url, request));
  }
  if (url.pathname === "/") url.pathname = "/index.html";
  else if (url.pathname === "/tickets" || url.pathname === "/tickets/") {
    url.pathname = "/tickets/index.html";
  }
  return env.ASSETS.fetch(new Request(url, request));
}
