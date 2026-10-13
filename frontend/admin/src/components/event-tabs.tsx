import { Link } from "@tanstack/react-router";

type EventTab = "basic" | "tickets" | "registrations";
interface RegistrationSearch {
  tab: "basic";
  status: "active" | "cancelled";
  ticket: string;
  page: number;
}

export function EventTabs({
  eventId,
  activeTab,
  registrationSearch = { tab: "basic", status: "active", ticket: "all", page: 1 },
}: {
  eventId: string;
  activeTab: EventTab;
  registrationSearch?: RegistrationSearch;
}) {
  return (
    <nav
      className="mb-7 flex gap-6 overflow-x-auto border-b border-border"
      aria-label="イベント内ナビゲーション"
    >
      <Link
        to="/events/$eventId"
        params={{ eventId }}
        search={{ tab: "basic" }}
        activeOptions={{ exact: true }}
        aria-current={activeTab === "basic" ? "page" : undefined}
        className={tabClass(activeTab === "basic")}
      >
        基本情報
      </Link>
      <Link
        to="/events/$eventId"
        params={{ eventId }}
        search={{ tab: "tickets" }}
        activeOptions={{ exact: true }}
        aria-current={activeTab === "tickets" ? "page" : undefined}
        className={tabClass(activeTab === "tickets")}
      >
        チケット設定
      </Link>
      <Link
        to="/events/$eventId/registrations"
        params={{ eventId }}
        search={registrationSearch}
        activeOptions={{ exact: true }}
        aria-current={activeTab === "registrations" ? "page" : undefined}
        className={tabClass(activeTab === "registrations")}
      >
        参加者
      </Link>
    </nav>
  );
}

function tabClass(active: boolean) {
  return active
    ? "shrink-0 border-b-2 border-primary px-1 pb-3 text-sm font-medium text-primary"
    : "shrink-0 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground";
}
