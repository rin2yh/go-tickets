import { Clerk } from "@clerk/clerk-js";

const result = document.querySelector("#result");
const message = (value) => { result.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); };
const config = await fetch("/auth/config").then((r) => r.json());
const clerk = new Clerk(config.publishableKey);
await clerk.load();
clerk.mountSignIn(document.querySelector("#sign-in"));
clerk.mountUserButton(document.querySelector("#user-button"));
function updateSession() {
  const signedIn = Boolean(clerk.user && clerk.session);
  document.querySelector("#session").textContent = signedIn ? `ログイン中: ${clerk.user.primaryEmailAddress?.emailAddress || clerk.user.id}` : "未ログイン";
  document.querySelector("#register").disabled = !signedIn;
  document.querySelector("#cancel").disabled = !signedIn;
}
clerk.addListener(updateSession);
updateSession();
async function api(path) {
  const token = await clerk.session?.getToken();
  if (!token) return message("ログインしてください");
  const response = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ticket_type_id: 1 }) });
  message({ status: response.status, body: await response.json() });
}
document.querySelector("#register").addEventListener("click", () => api("/registrations"));
document.querySelector("#cancel").addEventListener("click", () => api("/registrations/cancel"));
