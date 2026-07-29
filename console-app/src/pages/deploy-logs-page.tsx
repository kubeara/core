import { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { getErrorMessage } from "@/api/api-error";
import { DeploymentLogs } from "@/components/deployment-logs";
import { deployTemplate } from "@/features/deployments/api";
import {
  deployCustomCompose,
  CUSTOM_TEMPLATE_SLUG,
} from "@/features/deployments/api/custom-compose";
import { useDeploymentQuery } from "@/features/deployments/hooks";
import { useTemplateDetailsQuery } from "@/features/templates/hooks";
import {
  getDeploymentSocket,
  subscribeDeploymentLogs,
} from "@/lib/socket/deployment-socket-client";
import { getTemplateAccentColor } from "@/features/templates/utils/deploy-form-schema";
import { formatTemplateCategory } from "@/features/templates/utils/format-template-category";
import type { DeployTemplateRequest } from "@/features/templates/types";
import { DeployLogsPageSkeleton } from "@/components/shared/skeleton";
import { buildServerDetailHref } from "@/features/servers/components/server-detail/utils/server-detail-tab-url";
import { showErrorToast } from "@/lib/toast";
import { NotFoundPage } from "./not-found-page";

type PendingDeployLocationState = {
  deployRequest?: Pick<
    DeployTemplateRequest,
    "env" | "ports" | "templateSlug" | "serverId" | "acknowledgeResourceWarning"
  > & {
    /** Present for custom compose uploads; triggers the custom deploy API. */
    composeYaml?: string;
    envFileContent?: string;
    displayName?: string;
  };
  /** Optional override when opening logs from Activity (or elsewhere). */
  backHref?: string;
};

/**
 * Deployment logs page for a template or custom-compose deployment on a server.
 *
 * URL:  /servers/:serverId/deploy/:templateSlug/logs
 * Query: ?deploymentId=... (set after deploy starts)
 * State: { deployRequest: { serverId, templateSlug, env, composeYaml? } }
 */
export function DeployLogsPage() {
  const { serverId, templateSlug } = useParams<{
    serverId: string;
    templateSlug: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [deploymentId, setDeploymentId] = useState<string | undefined>(
    () => searchParams.get("deploymentId") ?? undefined,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const locationState = location.state as PendingDeployLocationState | null;
  const pendingDeploy = locationState?.deployRequest;
  const isCustomCompose =
    templateSlug === CUSTOM_TEMPLATE_SLUG ||
    Boolean(pendingDeploy?.composeYaml);
  const templateQuery = useTemplateDetailsQuery(
    isCustomCompose ? undefined : templateSlug,
  );
  const deploymentQuery = useDeploymentQuery(
    isCustomCompose ? deploymentId : undefined,
  );
  const backHref =
    locationState?.backHref ??
    (serverId
      ? buildServerDetailHref(
          serverId,
          isCustomCompose ? "overview" : "templates",
        )
      : "/servers");

  const handleDeploymentFailed = useCallback(
    (message: string) => {
      showErrorToast(message);
      navigate(backHref, { replace: true });
    },
    [backHref, navigate],
  );

  const deployStartedRef = useRef(false);

  useEffect(() => {
    const socket = getDeploymentSocket();
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  useEffect(() => {
    const fromQuery = searchParams.get("deploymentId");
    if (fromQuery && fromQuery !== deploymentId) {
      setDeploymentId(fromQuery);
    }
  }, [deploymentId, searchParams]);

  useEffect(() => {
    if (!deploymentId) {
      return;
    }
    subscribeDeploymentLogs(deploymentId);
  }, [deploymentId]);

  useEffect(() => {
    if (
      deploymentId ||
      !pendingDeploy ||
      !serverId ||
      !templateSlug ||
      deployStartedRef.current
    ) {
      return;
    }

    deployStartedRef.current = true;

    let cancelled = false;
    setIsStarting(true);
    setStartError(null);

    const deployPromise = pendingDeploy.composeYaml
      ? deployCustomCompose({
          composeYaml: pendingDeploy.composeYaml,
          envFileContent: pendingDeploy.envFileContent,
          serverId,
          displayName: pendingDeploy.displayName ?? "Custom Compose",
          env: pendingDeploy.env,
          ports: pendingDeploy.ports,
          acknowledgeResourceWarning: pendingDeploy.acknowledgeResourceWarning,
        })
      : deployTemplate({
          templateSlug,
          serverId,
          env: pendingDeploy.env,
          ports: pendingDeploy.ports,
          acknowledgeResourceWarning: pendingDeploy.acknowledgeResourceWarning,
        });

    void deployPromise
      .then((result) => {
        if (cancelled) return;
        const id = result.deploymentId;
        setDeploymentId(id);
        const socket = getDeploymentSocket();
        if (socket.connected) {
          subscribeDeploymentLogs(id);
        } else {
          socket.once("connect", () => subscribeDeploymentLogs(id));
        }
        navigate(
          `/servers/${serverId}/deploy/${encodeURIComponent(templateSlug)}/logs?deploymentId=${encodeURIComponent(id)}`,
          {
            replace: true,
            state: {
              ...(locationState?.backHref
                ? { backHref: locationState.backHref }
                : {}),
              ...(pendingDeploy?.displayName
                ? {
                    deployRequest: {
                      displayName: pendingDeploy.displayName,
                    },
                  }
                : {}),
            },
          },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStartError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsStarting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    deploymentId,
    locationState?.backHref,
    navigate,
    pendingDeploy,
    serverId,
    templateSlug,
  ]);

  if (!serverId || !templateSlug) {
    return <Navigate to="/servers" replace />;
  }

  // Platform templates: wait for details before first paint (unless already deploying).
  if (!isCustomCompose && !deploymentId && templateQuery.isPending) {
    return <DeployLogsPageSkeleton />;
  }

  // Platform templates: missing template and no in-flight deploy.
  if (
    !isCustomCompose &&
    !deploymentId &&
    (templateQuery.isError || !templateQuery.data)
  ) {
    return <NotFoundPage />;
  }

  if (!deploymentId && pendingDeploy && isStarting) {
    return <DeployLogsPageSkeleton />;
  }

  const template = templateQuery.data;
  const customDisplayName =
    pendingDeploy?.displayName?.trim() ||
    deploymentQuery.data?.displayName?.trim() ||
    "Custom Compose";
  const displayName = isCustomCompose
    ? customDisplayName
    : template
      ? template.name
      : templateSlug;
  const displayDescription = isCustomCompose
    ? "User-uploaded Docker Compose stack"
    : (template?.shortDescription ?? "");
  const displayCategory = isCustomCompose
    ? "Custom"
    : (formatTemplateCategory(template?.category) ?? "");
  const displayColor = getTemplateAccentColor(
    template?.slug ?? (isCustomCompose ? CUSTOM_TEMPLATE_SLUG : templateSlug),
  );

  return (
    <DeploymentLogs
      template={{
        id: template?.slug ?? templateSlug,
        name: displayName,
        description: displayDescription,
        category: displayCategory,
        color: displayColor,
        logo: template?.logo ?? null,
      }}
      deploymentId={deploymentId}
      serverId={serverId}
      backHref={backHref}
      isStarting={isStarting || Boolean(pendingDeploy && !deploymentId)}
      startError={startError}
      onDeploymentFailed={handleDeploymentFailed}
    />
  );
}
