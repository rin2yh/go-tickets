import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, Show, SignIn, UserButton, useAuth, useUser } from "@clerk/react";

function SignedInPanel() {
  const { user } = useUser();
  const name = user?.username || user?.fullName || user?.firstName || "ユーザー";

  return (
    <>
      <UserButton />
      <p>ログイン中: {name}</p>
      <RegistrationActions />
    </>
  );
}

function RegistrationActions() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function callAPI(path: string) {
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        setResult("ログインしてください");
        return;
      }
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticket_type_id: 1 }),
      });
      setResult(JSON.stringify({ status: response.status, body: await response.json() }, null, 2));
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded || !isSignedIn) return null;

  return (
    <>
      <button disabled={busy} onClick={() => callAPI("/registrations")}>
        チケット種別1へ申込
      </button>
      <button disabled={busy} onClick={() => callAPI("/registrations/cancel")}>
        申込をキャンセル
      </button>
      <pre id="result" aria-live="polite">
        {result}
      </pre>
    </>
  );
}

function App() {
  return (
    <>
      <Show when="signed-out">
        <SignIn />
        <p>未ログイン</p>
      </Show>
      <Show when="signed-in">
        <SignedInPanel />
      </Show>
    </>
  );
}

async function start() {
  const rootElement = document.querySelector<HTMLDivElement>("#root");
  if (!rootElement) throw new Error("#root element is missing");
  const root = createRoot(rootElement);

  try {
    const response = await fetch("/auth/config");
    if (!response.ok) throw new Error(`認証設定の取得に失敗しました (${response.status})`);
    const { publishableKey } = await response.json();
    root.render(
      <ClerkProvider publishableKey={publishableKey}>
        <App />
      </ClerkProvider>,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    root.render(<p role="alert">認証を初期化できませんでした: {message}</p>);
  }
}

void start();
