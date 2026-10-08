import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { requestAsUser, verifyRequest } from "./auth.mjs";

// Clerk tokens are RS256 JWTs. Tests use a local signing key and the matching
// PEM public key, so they do not depend on Clerk or network access.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: "spki", format: "pem" }).toString();
const now = Math.floor(Date.now() / 1000);
function token(claims) {
  const head = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input = `${head}.${body}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}
const claims = { sub: "user_TestUser123", azp: "http://localhost:8787", iat: now, nbf: now - 1, exp: now + 60 };
const env = { CLERK_SECRET_KEY: "test", CLERK_PUBLISHABLE_KEY: "pk_test", CLERK_AUTHORIZED_PARTIES: "http://localhost:8787" };

describe("Clerk token verification", () => {
  it("accepts a valid token from an authorized party", async () => {
    const jwt = token(claims);
    const result = await verifyRequest(new Request("http://localhost", { headers: { Authorization: `Bearer ${jwt}` } }), { ...env, CLERK_SECRET_KEY: undefined, CLERK_JWT_KEY: jwtKey });
    expect(result).toEqual({ id: claims.sub });
  });

  it("rejects absent, expired, and wrong-party tokens", async () => {
    expect(await verifyRequest(new Request("http://localhost"), { ...env, CLERK_JWT_KEY: jwtKey })).toBeNull();
    const expired = token({ ...claims, exp: now - 10 });
    expect(await verifyRequest(new Request("http://localhost", { headers: { Authorization: `Bearer ${expired}` } }), { ...env, CLERK_JWT_KEY: jwtKey })).toBeNull();
    const wrongParty = token({ ...claims, azp: "https://attacker.example" });
    expect(await verifyRequest(new Request("http://localhost", { headers: { Authorization: `Bearer ${wrongParty}` } }), { ...env, CLERK_JWT_KEY: jwtKey })).toBeNull();
  });

  it("replaces a client supplied identity header with the verified identity", () => {
    const request = new Request("https://tickets.example/registrations", { headers: { "X-Go-Tickets-Authenticated-User": "user_Forged" } });
    const trusted = requestAsUser(request, { id: "user_Verified123" });
    expect(trusted.headers.get("X-Go-Tickets-Authenticated-User")).toBe("user_Verified123");
  });
});
