import { Link, useParams } from "react-router-dom";
import { ServerDetailTabs } from "@/components/server-detail-tabs";
import { useServerQuery } from "@/api/hooks/use-servers";
import { ApiError } from "@/lib/api-error";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: server, isPending, isError, error } = useServerQuery(id);

  if (isPending) {
    return null;
  }

  if (isError && error instanceof ApiError && error.status === 404) {
    return <NotFoundPage />;
  }

  if (!server) {
    return <NotFoundPage />;
  }

  return (
    <div className="dashboard server-detail">
      <Link to="/servers" className="deploy-logs-back">
        ← Back to Servers
      </Link>

      <header className="dashboard-header">
        <div>
          <h1>{server.name}</h1>
          <p>
            <code>{server.host}</code> · {server.username}
          </p>
        </div>
        <span className={`status-pill status-${server.status}`}>
          {server.status}
        </span>
      </header>

      <ServerDetailTabs server={server} />
    </div>
  );
}
