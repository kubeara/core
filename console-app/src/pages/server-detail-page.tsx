import { useParams } from "react-router-dom";
import { BackLink } from "@/components/shared/back-link";
import { ServerDetailTabs } from "@/components/server-detail-tabs";
import { useServerQuery } from "@/features/servers/hooks";
import { ApiError, getErrorMessage } from "@/api/api-error";
import { ServerFeedbackMessage } from "@/features/servers/components/server-feedback-message";
import { NotFoundPage } from "./not-found-page";

/**
 * Server detail page.
 *
 * Displays detailed information about a specific server:
 * - Server name, host, username
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
        <BackLink to="/servers" label="Back to Servers" />
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
      <BackLink to="/servers" label="Back to Servers" />

      <header className="dashboard-header">
        <div>
          <h1>{server.name}</h1>
          <p>
            <code>{server.host}</code> · {server.username}
          </p>
        </div>
      </header>

      <ServerDetailTabs server={server} />
    </div>
  );
}
