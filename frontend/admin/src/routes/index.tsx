import { createFileRoute } from "@tanstack/react-router";
import { AdminStatus } from "../components/admin-shell";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return (
    <main>
      <h2>管理概要</h2>
      <AdminStatus />
    </main>
  );
}
