import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/events/$eventId/registrations")({
  component: Registrations,
});
function Registrations() {
  const { eventId } = Route.useParams();
  return (
    <main>
      <h2>イベント {eventId} の申込状況</h2>
      <p>申込一覧APIは未実装です。</p>
    </main>
  );
}
