import { useState } from "react";
import { useNavigate } from "react-router";
import { getErrorMessage } from "@/api/api-error";
import {
  DeploymentStatus,
  isTerminalDeploymentStatus,
} from "@/constants/deployment-events";
import { ServerDetailSectionHeader } from "../server-detail-section-header";
import {
  useActivityDetailQuery,
  useServerActivitiesQuery,
} from "../../../hooks/use-server-activity";
import type { ActivityListItem } from "../../../types/activity";
import {
  activityIcon,
  activityIconClass,
  formatActivityTime,
} from "../utils/activity-icon";
import { buildServerDetailHref } from "../utils/server-detail-tab-url";

type ServerActivityTabProps = {
  serverId: string;
};

type ActivityAction = "live" | "error" | null;

/**
 * Live deploy → full logs page. Failed / validation-stopped → error detail. Else list only.
 */
function getActivityAction(item: ActivityListItem): ActivityAction {
  const isDeployRelated =
    item.type === "deployment" ||
    item.type === "deployment_remove" ||
    item.type === "deployment_validation_stopped";

  if (!isDeployRelated || !item.deploymentId) {
    return null;
  }

  if (
    item.type !== "deployment_validation_stopped" &&
    !isTerminalDeploymentStatus(item.operationStatus) &&
    item.templateSlug
  ) {
    return "live";
  }

  if (
    item.operationStatus === DeploymentStatus.FAILED ||
    item.type === "deployment_validation_stopped"
  ) {
    return "error";
  }

  return null;
}

function statusToneClass(status: string): string {
  switch (status) {
    case DeploymentStatus.SUCCESS:
    case DeploymentStatus.RUNNING:
    case DeploymentStatus.REMOVED:
      return "is-success";
    case DeploymentStatus.FAILED:
    case DeploymentStatus.CANCELLED:
      return "is-failed";
    case DeploymentStatus.PENDING:
    case DeploymentStatus.VALIDATING:
    case DeploymentStatus.PULLING:
    case DeploymentStatus.BUILDING:
    case DeploymentStatus.DEPLOYING:
    case DeploymentStatus.REMOVING:
      return "is-live";
    default:
      return "";
  }
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

/**
 * Server Activity tab: one-row-per-event timeline.
 */
export function ServerActivityTab({ serverId }: ServerActivityTabProps) {
  const navigate = useNavigate();
  const [errorActivityId, setErrorActivityId] = useState<string | null>(null);
  const {
    data: activities = [],
    isLoading,
    isError,
    error,
  } = useServerActivitiesQuery(serverId);

  const selectedError =
    activities.find((item) => item.id === errorActivityId) ?? null;

  function handleActivityClick(item: ActivityListItem) {
    const action = getActivityAction(item);
    if (action === "live" && item.deploymentId && item.templateSlug) {
      navigate(
        `/servers/${serverId}/deploy/${encodeURIComponent(item.templateSlug)}/logs?deploymentId=${encodeURIComponent(item.deploymentId)}`,
        {
          state: {
            backHref: buildServerDetailHref(serverId, "activity"),
          },
        },
      );
      return;
    }
    if (action === "error") {
      setErrorActivityId(item.id);
    }
  }

  if (selectedError) {
    return (
      <FailedDeployDetail
        activity={selectedError}
        onBack={() => setErrorActivityId(null)}
      />
    );
  }

  return (
    <div className="server-detail-panel">
      <ServerDetailSectionHeader
        title="Recent activity"
        description="Live deploys open logs. Failed deploys show the error. Everything else stays in the list."
      />

      {isLoading && (
        <div className="server-templates-state">
          <p className="server-templates-state-text">Loading activity…</p>
        </div>
      )}

      {isError && (
        <div className="server-templates-state server-templates-state-error">
          <p className="server-templates-state-title">Could not load activity</p>
          <p className="server-templates-state-text">{getErrorMessage(error)}</p>
        </div>
      )}

      {!isLoading && !isError && activities.length === 0 && (
        <div className="server-templates-state">
          <p className="server-templates-state-title">No activity yet</p>
          <p className="server-templates-state-text">
            Deploy a service, open a terminal, or manage containers to see history here.
          </p>
        </div>
      )}

      {!isLoading && !isError && activities.length > 0 && (
        <ul className="activity-feed" role="list">
          {activities.map((item) => {
            const action = getActivityAction(item);
            const interactive = action !== null;
            const RowTag = interactive ? "button" : "div";

            return (
              <li key={item.id} className="activity-feed-row">
                <RowTag
                  {...(interactive
                    ? {
                        type: "button" as const,
                        onClick: () => handleActivityClick(item),
                      }
                    : {})}
                  className={[
                    "activity-item",
                    interactive ? "activity-item-button" : "activity-item-static",
                    action === "live" ? "is-live" : "",
                    action === "error" ? "is-failed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div
                    className={`activity-icon ${activityIconClass(item.type)}`}
                    aria-hidden
                  >
                    {activityIcon(item.type)}
                  </div>
                  <div className="activity-body">
                    <div className="activity-body-top">
                      <strong>{item.title}</strong>
                      <span
                        className={`activity-status ${statusToneClass(item.operationStatus)}`}
                      >
                        {action === "live" ? (
                          <span className="activity-live-dot" aria-hidden />
                        ) : null}
                        {formatStatusLabel(item.operationStatus)}
                      </span>
                    </div>
                    <p>{item.message || formatStatusLabel(item.operationStatus)}</p>
                    {action === "live" ? (
                      <span className="activity-action-hint">
                        Open live deployment logs →
                      </span>
                    ) : null}
                    {action === "error" ? (
                      <span className="activity-action-hint activity-action-hint-error">
                        View error details →
                      </span>
                    ) : null}
                  </div>
                  <time
                    className="activity-time"
                    dateTime={new Date(item.createdAt * 1000).toISOString()}
                  >
                    {formatActivityTime(item.createdAt)}
                  </time>
                </RowTag>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type FailedDeployDetailProps = {
  activity: ActivityListItem;
  onBack: () => void;
};

/**
 * Error detail for a failed / validation-stopped deployment (message only — no logs table).
 */
function FailedDeployDetail({ activity, onBack }: FailedDeployDetailProps) {
  const { data: detail, isLoading } = useActivityDetailQuery(activity.id);
  const message = detail?.message ?? activity.message;

  return (
    <div className="server-detail-panel">
      <div className="activity-detail-header">
        <button type="button" className="activity-back-button" onClick={onBack}>
          ← Back to activity
        </button>
        <ServerDetailSectionHeader
          title={activity.title}
          description={message || "Deployment failed."}
        />
        <div className="activity-detail-meta">
          <span
            className={`activity-status ${statusToneClass(activity.operationStatus)}`}
          >
            {formatStatusLabel(activity.operationStatus)}
          </span>
          {activity.templateSlug ? (
            <span className="activity-detail-slug">{activity.templateSlug}</span>
          ) : null}
        </div>
        {isLoading && !detail ? (
          <p className="activity-detail-meta">Loading…</p>
        ) : message ? (
          <p className="activity-error-banner" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
