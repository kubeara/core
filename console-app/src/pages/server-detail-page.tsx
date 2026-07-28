import { useParams } from "react-router";
import { BackLink } from "@/components/shared/back-link";
import { SensitiveHost } from "@/components/shared/sensitive-host";
import { ServerDetailTabs } from "@/components/server-detail-tabs";
import { useServerQuery } from "@/features/servers/hooks";
import { isServerOperationBusy } from "@/features/servers/types";
import { ApiError, getErrorMessage } from "@/api/api-error";
import {
  SERVER_OPERATION_REMOVING_LABEL,
  SERVER_OPERATION_SETTING_UP_LABEL,
} from "@/features/servers/constants/messages";
import { ServerFeedbackMessage } from "@/features/servers/components/server-feedback-message";
import { ServerDetailPageSkeleton } from "@/components/shared/skeleton";
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
    return <ServerDetailPageSkeleton />;
  }

  if (isError && error instanceof ApiError && error.status === 404) {
    return <NotFoundPage />;
  }

  if (isError) {
    return (
      <div className="dashboard server-detail">
        <BackLink to="/servers" label="Back" />
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

  const busy = isServerOperationBusy(server.operationStatus);
  const operationLabel =
    server.operationStatus === "starting"
      ? SERVER_OPERATION_SETTING_UP_LABEL
      : server.operationStatus === "removing"
        ? SERVER_OPERATION_REMOVING_LABEL
        : null;

  return (
    <div className="dashboard server-detail">
      <header className="server-detail-header">
        <BackLink to="/servers" label="Back" />
        <div className="server-detail-header-main">
          <h1>{server.name}</h1>
          <p>
            {server.username} · {" "} 
            <span className="server-detail-host-row">
              <SensitiveHost
                host={server.host}
                className="server-detail-host-row"
              />
            </span>
          </p>
          {operationLabel && (
            <span
              className={`server-tag-pill ${
                server.operationStatus === "starting"
                  ? "starting"
                  : server.operationStatus === "removing"
                    ? "removing"
                    : server.operationStatus === "error"
                      ? "error"
                      : "pending"
              }`}
            >
              {operationLabel}
            </span>
          )}
        </div>
      </header>

      {busy ? (
        <p className="server-detail-operation-notice" role="status">
          {server.operationStatus === "starting"
            ? "Agent installation is in progress. Server features will be available when setup completes."
            : "Server removal is in progress."}
        </p>
      ) : (
        <ServerDetailTabs server={server} />
      )}
    </div>
  );
}
