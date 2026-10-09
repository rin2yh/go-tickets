export async function fetchStaticAsset(request, env) {
  if (!env.ASSETS) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  if (url.pathname.startsWith("/events/") && !url.pathname.split("/").at(-1)?.includes(".")) {
    const eventId = url.pathname.match(/^\/events\/(\d+)\/?$/)?.[1];
    if (!eventId) return new Response("Not found", { status: 404 });
    url.pathname = "/events/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  }
  if (url.pathname === "/") url.pathname = "/index.html";
  else if (url.pathname === "/tickets" || url.pathname === "/tickets/") {
    url.pathname = "/tickets/index.html";
  }
  return env.ASSETS.fetch(new Request(url, request));
}
