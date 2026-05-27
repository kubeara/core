import { Link, useParams } from "react-router-dom";
import { ServerDetailTabs } from "@/components/server-detail-tabs";
import { useServerQuery } from "@/features/servers/hooks";
import { ApiError, getErrorMessage } from "@/api/api-error";
import { ServerFeedbackMessage } from "@/features/servers/components/server-feedback-message";
import { NotFoundPage } from "./not-found-page";

/**
 * Server detail page.
 *
 * Displays detailed information about a specific server:
 * - Server name, host, username, status
 * - Tabs for Overview, Deployments, and Settings
 * - Back link to servers list
 */
export function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: server, isPending, isError, error, refetch } = useServerQuery(id);

  if (isPending) {
    return null;
  }

  if (isError && error instanceof ApiError && error.status === 404) {
    return <NotFoundPage />;
  }

  if (isError) {
    return (
      <div className="dashboard server-detail">
        <Link to="/servers" className="deploy-logs-back">
          ← Back to Servers
        </Link>
        <ServerFeedbackMessage
          variant="error"
          message={getErrorMessage(error)}
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
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
