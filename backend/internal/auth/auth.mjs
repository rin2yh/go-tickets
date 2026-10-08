import { verifyToken } from "@clerk/backend";

export async function verifyRequest(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match || (!env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) || !env.CLERK_PUBLISHABLE_KEY) return null;
  const parties = (env.CLERK_AUTHORIZED_PARTIES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parties.length === 0) return null;
  try {
    const result = await verifyToken(match[1], {
      ...(env.CLERK_JWT_KEY ? { jwtKey: env.CLERK_JWT_KEY } : { secretKey: env.CLERK_SECRET_KEY }),
      authorizedParties: parties,
    });
    const data = result?.data ?? result;
    const errors = result?.errors;
    if (errors?.length || typeof data?.sub !== "string" || !/^user_[A-Za-z0-9]{1,123}$/.test(data.sub)) return null;
    return { id: data.sub };
  } catch {
    return null;
  }
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function requestAsUser(request, user) {
  const headers = new Headers(request.headers);
  headers.delete("X-Go-Tickets-Authenticated-User");
  if (user) headers.set("X-Go-Tickets-Authenticated-User", user.id);
  return new Request(request, { headers });
}
