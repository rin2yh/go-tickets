import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/check-in")({ component: CheckIn });
function CheckIn() {
  return (
    <main>
      <h2>チェックイン</h2>
      <p>チェックインAPIは未実装です。</p>
    </main>
  );
}
