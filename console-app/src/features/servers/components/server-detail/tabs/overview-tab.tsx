import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown } from "@/components/shared/dropdown";
import { FilterClearButton } from "@/components/shared/filter-clear-button";
import { ContainerActionConfirmModal } from "@/features/deployments/components/container-action-confirm-modal";
import { DeployResourceWarningConfirmModal } from "@/features/deployments/components/deploy-resource-warning-confirm-modal";
import {
  getKubearaAgentActionWarningMessage,
  getKubearaAgentActionWarningTitle,
} from "@/features/deployments/constants/container-action-messages";
import { useContainerActionMutation } from "@/features/deployments/hooks";
import { useTemplatesQuery } from "@/features/templates/hooks";
import type {
  ContainerActionType,
  ServerContainer,
} from "@/features/deployments/types";
import { SkeletonMarketplaceGrid } from "@/components/shared/skeleton";
import { ServerDetailSectionHeader } from "../server-detail-section-header";
import { ConnectedServiceCard } from "../connected-service-card";
import {
  CONTAINER_STATUS_FILTER_OPTIONS,
  getContainerDisplayName,
  getContainerServiceName,
  isKubearaAgentContainer,
  isKubearaManagedContainer,
  matchesContainerStatusFilter,
  type ContainerStatusFilter,
} from "../utils/container-display";

type ServerOverviewTabProps = {
  serverId: string;
  serverHost: string;
  containers: ServerContainer[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
};

export function ServerOverviewTab({
  serverId,
  serverHost,
  containers,
  isLoading,
  isError,
  errorMessage,
}: ServerOverviewTabProps) {
  const { data: templatesResponse } = useTemplatesQuery(undefined, serverId);
  const templateLogos = useMemo(
    () =>
      new Map(
        (templatesResponse?.data ?? []).map((template) => [
          template.slug,
          template.logo ?? null,
        ]),
      ),
    [templatesResponse?.data],
  );

  const containerActionMutation = useContainerActionMutation();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ContainerStatusFilter>("");
  const [pendingAction, setPendingAction] = useState<{
    containerId: string | null;
    action: ContainerActionType;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    container: ServerContainer;
    action: ContainerActionType;
  } | null>(null);
  const [agentActionWarning, setAgentActionWarning] =
    useState<ContainerActionType | null>(null);

  const isConfirmPending = Boolean(
    confirmAction &&
    pendingAction?.containerId === confirmAction.container.containerId &&
    pendingAction.action === confirmAction.action,
  );

  const filteredContainers = useMemo(
    () =>
      containers.filter((container) =>
        matchesContainerStatusFilter(container, statusFilter),
      ),
    [containers, statusFilter],
  );

  const kubearaManagedContainers = filteredContainers
    .filter((container) => isKubearaManagedContainer(container))
    .sort((left, right) => {
      const leftIsAgent = isKubearaAgentContainer(left);
      const rightIsAgent = isKubearaAgentContainer(right);
      if (leftIsAgent && !rightIsAgent) {
        return -1;
      }
      if (!leftIsAgent && rightIsAgent) {
        return 1;
      }
      return getContainerDisplayName(left).localeCompare(
        getContainerDisplayName(right),
      );
    });

  const selfManagedContainers = filteredContainers.filter(
    (container) => !isKubearaManagedContainer(container),
  );

  const hasActiveFilter = statusFilter !== "";

  function handleContainerActionRequest(
    container: ServerContainer,
    action: ContainerActionType,
  ) {
    if (isKubearaAgentContainer(container)) {
      setAgentActionWarning(action);
      return;
    }

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
        deploymentId: container.deploymentId,
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

  function renderContainerCard(container: ServerContainer) {
    return (
      <ConnectedServiceCard
        key={
          container.containerId ??
          `${container.deploymentId ?? "offline"}-${container.containerName}`
        }
        container={container}
        serverHost={serverHost}
        logo={
          container.templateId
            ? (templateLogos.get(container.templateId) ?? null)
            : null
        }
        pendingAction={pendingAction}
        onAction={handleContainerActionRequest}
        onViewLogs={handleViewLogs}
      />
    );
  }

  return (
    <div className="server-detail-panel">
      {agentActionWarning ? (
        <DeployResourceWarningConfirmModal
          title={getKubearaAgentActionWarningTitle(agentActionWarning)}
          message={getKubearaAgentActionWarningMessage(agentActionWarning)}
          dismissLabel="OK"
          onCancel={() => setAgentActionWarning(null)}
        />
      ) : null}

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

      <ServerDetailSectionHeader
        title="Connected services"
        description="Containers discovered on this server, including Kubeara deployments and self-managed workloads."
      />

      {!isLoading && !isError && containers.length > 0 ? (
        <div className="server-templates-toolbar connected-services-toolbar">
          <div className="server-templates-filters">
            <div className="server-templates-filter-row">
              <Dropdown
                id="connected-services-status"
                className="server-templates-category-dropdown"
                value={statusFilter}
                options={CONTAINER_STATUS_FILTER_OPTIONS}
                onChange={setStatusFilter}
                ariaLabel="Filter by status"
                searchable
                searchPlaceholder="Search statuses…"
                noResultsLabel="No statuses found"
                pinnedOptionValue=""
              />
              {hasActiveFilter ? (
                <FilterClearButton onClick={() => setStatusFilter("")} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonMarketplaceGrid count={3} label="Loading containers…" variant="overview" />
      ) : isError ? (
        <p className="server-detail-empty">
          {errorMessage ?? "Could not connect to this server. The SSH connection failed."}
        </p>
      ) : containers.length === 0 ? (
        <p className="server-detail-empty">No services connected yet.</p>
      ) : filteredContainers.length === 0 ? (
        <p className="server-detail-empty">
          No services match the selected status filters.
        </p>
      ) : (
        <>
          <div className="server-templates-grid">
            {kubearaManagedContainers.map(renderContainerCard)}
          </div>

          {selfManagedContainers.length > 0 && (
            <>
              <h3 className="connected-services-section-title">Self Managed</h3>

              <div className="server-templates-grid">
                {selfManagedContainers.map(renderContainerCard)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
