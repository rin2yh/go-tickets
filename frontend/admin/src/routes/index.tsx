import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return (
    <main>
      <h2>管理概要</h2>
      <p>イベントまたはチェックインを選択してください。</p>
    </main>
  );
}
