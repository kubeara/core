import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ContainerActionConfirmModal } from "@/features/deployments/components/container-action-confirm-modal";
import { useContainerActionMutation } from "@/features/deployments/hooks";
import { useTemplatesQuery } from "@/features/templates/hooks";
import type {
  ContainerActionType,
  ServerContainer,
} from "@/features/deployments/types";
import { SkeletonMarketplaceGrid } from "@/components/shared/skeleton";
import { ConnectedServiceCard } from "../connected-service-card";
import { getContainerDisplayName, getContainerServiceName } from "../utils/container-display";

type ServerOverviewTabProps = {
  serverId: string;
  containers: ServerContainer[];
  isLoading: boolean;
  isError: boolean;
};

export function ServerOverviewTab({
  serverId,
  containers,
  isLoading,
  isError,
}: ServerOverviewTabProps) {
  const { data: templates = [] } = useTemplatesQuery(serverId);
  const templateLogos = useMemo(
    () =>
      new Map(
        templates.map((template) => [template.slug, template.logo ?? null]),
      ),
    [templates],
  );

  const containerActionMutation = useContainerActionMutation();
  const navigate = useNavigate();
  const [pendingAction, setPendingAction] = useState<{
    containerId: string | null;
    action: ContainerActionType;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    container: ServerContainer;
    action: ContainerActionType;
  } | null>(null);

  const isConfirmPending = Boolean(
    confirmAction &&
      pendingAction?.containerId === confirmAction.container.containerId &&
      pendingAction.action === confirmAction.action,
  );

  function handleContainerActionRequest(
    container: ServerContainer,
    action: ContainerActionType,
  ) {
    setConfirmAction({ container, action });
  }

  async function handleContainerActionConfirm() {
    if (!confirmAction?.container.containerId) {
      return;
    }

    const { container, action } = confirmAction;
    const containerId = container.containerId;

    setPendingAction({ containerId, action });
    try {
      await containerActionMutation.mutateAsync({
        serverId,
        containerId: containerId ?? "",
        containerName: getContainerDisplayName(container),
        action,
      });
      setConfirmAction(null);
    } finally {
      setPendingAction(null);
    }
  }

  function handleViewLogs(container: ServerContainer) {
    if (!container.containerId) {
      return;
    }

    navigate(
      `/servers/${encodeURIComponent(serverId)}/containers/${encodeURIComponent(container.containerId)}/logs`,
      {
        state: {
          containerName: getContainerDisplayName(container),
          serviceName: getContainerServiceName(container) ?? undefined,
        },
      },
    );
  }

  const kubearaManagedContainers = containers.filter(
    (container) => container.managedType === "KUBEARA_MANAGED",
  );

  const selfManagedContainers = containers.filter(
    (container) => container.managedType !== "KUBEARA_MANAGED",
  );

  return (
    <div className="server-detail-panel">
      {confirmAction ? (
        <ContainerActionConfirmModal
          containerName={getContainerDisplayName(confirmAction.container)}
          action={confirmAction.action}
          isPending={isConfirmPending}
          onCancel={() => {
            if (!isConfirmPending) {
              setConfirmAction(null);
            }
          }}
          onConfirm={() => void handleContainerActionConfirm()}
        />
      ) : null}

      <h2 className="server-detail-section-title">Connected services</h2>

      <p className="server-detail-section-desc">
        Containers discovered on this server, including Kubeara deployments and
        self-managed workloads.
      </p>

      {isLoading ? (
        <SkeletonMarketplaceGrid count={3} label="Loading containers…" />
      ) : isError ? (
        <p className="server-detail-empty">
          Could not load containers. Check that this server is online.
        </p>
      ) : containers.length === 0 ? (
        <p className="server-detail-empty">No services connected yet.</p>
      ) : (
        <>
          <div className="server-templates-grid">
            {kubearaManagedContainers.map((container) => (
              <ConnectedServiceCard
                key={
                  container.containerId ??
                  `${container.deploymentId ?? "offline"}-${container.containerName}`
                }
                container={container}
                logo={
                  container.templateId
                    ? (templateLogos.get(container.templateId) ?? null)
                    : null
                }
                pendingAction={pendingAction}
                onAction={handleContainerActionRequest}
                onViewLogs={handleViewLogs}
              />
            ))}
          </div>

          {selfManagedContainers.length > 0 && (
            <>
              <h3 className="connected-services-section-title">Self Managed</h3>

              <div className="server-templates-grid">
                {selfManagedContainers.map((container) => (
                  <ConnectedServiceCard
                    key={
                      container.containerId ??
                      `${container.deploymentId ?? "offline"}-${container.containerName}`
                    }
                    container={container}
                    logo={
                      container.templateId
                        ? (templateLogos.get(container.templateId) ?? null)
                        : null
                    }
                    pendingAction={pendingAction}
                    onAction={handleContainerActionRequest}
                    onViewLogs={handleViewLogs}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
