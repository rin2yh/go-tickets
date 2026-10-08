import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/events/")({ component: Events });
function Events() {
  return (
    <main>
      <h2>イベント</h2>
      <p>イベント管理APIは未実装です。</p>
    </main>
  );
}
