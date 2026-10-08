import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/events/$eventId")({ component: Event });
function Event() {
  const { eventId } = Route.useParams();
  return (
    <main>
      <h2>イベント {eventId}</h2>
      <p>イベント詳細APIは未実装です。</p>
    </main>
  );
}
