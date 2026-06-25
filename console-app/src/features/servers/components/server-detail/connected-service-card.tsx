import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import { ContainerActionsMenu } from "@/features/deployments/components/container-actions-menu";
import type {
  ContainerActionType,
  ServerContainer,
} from "@/features/deployments/types";
import {
  containerStatusClass,
  getContainerCardHeadline,
  getContainerDockerName,
  getContainerHostPorts,
  getContainerServiceName,
  getManagedTypeLabel,
  getContainerStatusLabel,
  shouldShowDeployedBadge,
} from "./utils/container-display";

type ConnectedServiceCardProps = {
  container: ServerContainer;
  serverHost: string;
  logo?: string | null;
  pendingAction: {
    containerId: string | null;
    action: ContainerActionType;
  } | null;
  onAction: (container: ServerContainer, action: ContainerActionType) => void;
  onViewLogs?: (container: ServerContainer) => void;
};

export function ConnectedServiceCard({
  container,
  serverHost,
  logo,
  pendingAction,
  onAction,
  onViewLogs,
}: ConnectedServiceCardProps) {
  const statusClass = containerStatusClass(container);
  const containerId = container.containerId;
  const canManage = Boolean(containerId);
  const isPending = Boolean(
    containerId &&
      pendingAction?.containerId === containerId &&
      pendingAction.action,
  );

  const serviceName = getContainerServiceName(container);
  const headline = getContainerCardHeadline(container);
  const dockerName = getContainerDockerName(container);
  const showDockerName =
    Boolean(serviceName) &&
    dockerName !== serviceName &&
    dockerName !== headline;

  const statusLabel = getContainerStatusLabel(container);
  const hostPorts = getContainerHostPorts(container.ports ?? "");
  const portsDisplay =
    hostPorts.length > 0
      ? hostPorts.join(", ")
      : container.ports?.trim()
        ? container.ports
        : "N/A";

  return (
    <article
      className={`marketplace-card overview-container-card${!container.isOnline ? " marketplace-card-offline" : ""}`}
    >
      {canManage && containerId ? (
        <ContainerActionsMenu
          container={container}
          isPending={isPending}
          pendingAction={pendingAction}
          onAction={onAction}
          onViewLogs={onViewLogs}
        />
      ) : null}
      <div className="marketplace-card-header">
        <ServiceBrandIcon
          name={headline}
          logo={logo}
          className="marketplace-card-icon"
        />
        <div className="marketplace-card-headline">
          <p className="marketplace-card-category">
            {getManagedTypeLabel(container)}
          </p>
          <h3 className="marketplace-card-name" title={headline}>
            {headline}
            {!container.isOnline ? (
              <span className="marketplace-card-status-badge is-offline">
                Offline
              </span>
            ) : shouldShowDeployedBadge(container) ? (
              <span className="marketplace-card-deployed-badge">Deployed</span>
            ) : null}
          </h3>
        </div>
      </div>

      <div className="marketplace-card-body">
        {container.imageName ? (
          <p
            className="marketplace-card-description"
            title={container.imageName}
          >
            {container.imageName}
          </p>
        ) : (
          <p className="marketplace-card-description marketplace-card-description-empty">
            No image information available.
          </p>
        )}

        <dl className="marketplace-card-meta">
          {showDockerName ? (
            <div className="marketplace-card-meta-item">
              <dt>Container</dt>
              <dd>
                <code title={container.containerName || undefined}>
                  {dockerName}
                </code>
              </dd>
            </div>
          ) : null}
          <div className="marketplace-card-meta-item">
            <dt>Status</dt>
            <dd>
              <span className={`service-status service-status-${statusClass}`}>
                {statusLabel}
              </span>
            </dd>
          </div>
          <div className="marketplace-card-meta-item">
            <dt>Ports</dt>
            <dd title={container.ports || undefined}>
              {hostPorts.length > 0 && serverHost ? (
                hostPorts.map((port, index) => (
                  <span key={port}>
                    {index > 0 ? ", " : null}
                    <a
                      href={`http://${serverHost}:${port}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="container-port-link"
                    >
                      {port}
                    </a>
                  </span>
                ))
              ) : (
                <code>{portsDisplay}</code>
              )}
            </dd>
          </div>
          {container.runningSince ? (
            <div className="marketplace-card-meta-item">
              <dt>Created</dt>
              <dd>{container.runningSince}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  );
}
