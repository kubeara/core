import { useEffect } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { BackLink } from "@/components/shared/back-link";
import { ContainerLogsPanel } from "@/features/servers/components/container-logs-panel";
import { buildServerDetailHref } from "@/features/servers/components/server-detail/utils/server-detail-tab-url";
import { useServerQuery } from "@/features/servers/hooks";
import { getDeploymentSocket } from "@/lib/socket/deployment-socket-client";
import { ApiError, getErrorMessage } from "@/api/api-error";
import { ServerFeedbackMessage } from "@/features/servers/components/server-feedback-message";
import { ServerDetailPageSkeleton } from "@/components/shared/skeleton";
import { NotFoundPage } from "./not-found-page";

type ContainerLogsLocationState = {
  containerName?: string;
  serviceName?: string;
};

/**
 * Dedicated container logs page.
 *
 * URL: /servers/:serverId/containers/:containerId/logs
 */
export function ContainerLogsPage() {
  const { serverId, containerId } = useParams<{
    serverId: string;
    containerId: string;
  }>();
  const location = useLocation();
  const locationState = location.state as ContainerLogsLocationState | null;
  const serviceName = locationState?.serviceName?.trim() || null;
  const containerName =
    locationState?.containerName?.trim() || containerId || "Container";

  const { data: server, isPending, isError, error, refetch } = useServerQuery(
    serverId,
  );

  useEffect(() => {
    const socket = getDeploymentSocket();
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  if (!serverId || !containerId) {
    return <Navigate to="/servers" replace />;
  }

  if (isPending) {
    return <ServerDetailPageSkeleton />;
  }

  if (isError && error instanceof ApiError && error.status === 404) {
    return <NotFoundPage />;
  }

  if (isError) {
    return (
      <div className="dashboard service-detail-page">
        <BackLink to={buildServerDetailHref(serverId)} label="Back" />
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
    <div className="dashboard service-detail-page">
      <BackLink to={buildServerDetailHref(serverId)} label="Back" />

      <ContainerLogsPanel
        serverId={serverId}
        containerId={containerId}
        containerName={containerName}
        serviceName={serviceName}
        serverName={server.name}
        serverHost={server.host}
      />
    </div>
  );
}
