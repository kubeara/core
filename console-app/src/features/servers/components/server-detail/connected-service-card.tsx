import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import { ContainerActionsMenu } from "@/features/deployments/components/container-actions-menu";
import type {
  ContainerActionType,
  ServerContainer,
} from "@/features/deployments/types";
import {
  containerStatusClass,
  getContainerDisplayName,
  managedTypeLabel,
} from "./utils/container-display";

type ConnectedServiceCardProps = {
  container: ServerContainer;
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

  const displayName =
    container.containerName || container.templateId || "Container";

  const cleanName = getContainerDisplayName(container);

  const statusLabel = container.isOnline ? container.status : "Offline";
  const portsDisplay = container.ports?.match(/:(\d+)->/)?.[1] ?? "N/A";
  const subtitle = container.templateId ?? container.containerName;

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
          name={cleanName || displayName}
          logo={logo}
          className="marketplace-card-icon"
        />
        <div className="marketplace-card-headline">
          <p className="marketplace-card-category">
            {managedTypeLabel(container.managedType)}
          </p>
          <h3 className="marketplace-card-name" title={displayName}>
            {cleanName}
            {!container.isOnline ? (
              <span className="marketplace-card-status-badge is-offline">
                Offline
              </span>
            ) : container.managedType === "KUBEARA_MANAGED" ? (
              <span className="marketplace-card-deployed-badge">Deployed</span>
            ) : null}
          </h3>
          {subtitle ? (
            <p className="marketplace-card-slug">
              <code>{subtitle}</code>
            </p>
          ) : null}
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
            <dd>
              <code title={container.ports || undefined}>{portsDisplay}</code>
            </dd>
          </div>
          {container.runningSince ? (
            <div className="marketplace-card-meta-item">
              <dt>Running</dt>
              <dd>{container.runningSince}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  );
}
