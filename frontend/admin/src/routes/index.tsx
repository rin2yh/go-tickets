import { createFileRoute } from "@tanstack/react-router";
import { AdminStatus } from "../components/AdminShell";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return (
    <main>
      <h2>管理概要</h2>
      <AdminStatus />
    </main>
  );
}
