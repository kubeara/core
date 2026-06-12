import { useEffect, useRef, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { DeploymentLogs } from "@/components/deployment-logs";
import { deployTemplate } from "@/features/deployments/api";
import { useTemplateDetailsQuery } from "@/features/templates/hooks";
import {
  getDeploymentSocket,
  subscribeDeploymentLogs,
} from "@/lib/socket/deployment-socket-client";
import { getTemplateAccentColor } from "@/features/templates/utils/deploy-form-schema";
import type { DeployTemplateRequest } from "@/features/templates/types";
import { DeployLogsPageSkeleton } from "@/components/shared/skeleton";
import { buildServerDetailHref } from "@/features/servers/components/server-detail/utils/server-detail-tab-url";
import { NotFoundPage } from "./not-found-page";

type PendingDeployLocationState = {
  deployRequest?: Pick<
    DeployTemplateRequest,
    "env" | "ports" | "templateSlug" | "serverId"
  >;
};

/**
 * Deployment logs page for a template deployment on a specific server.
 *
 * URL:  /servers/:serverId/deploy/:templateSlug/logs
 * Query: ?deploymentId=... (set after deploy starts)
 * State: { deployRequest: { serverId, templateSlug, env } } for fresh deploys
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
  const templateQuery = useTemplateDetailsQuery(templateSlug);

  const pendingDeploy = (location.state as PendingDeployLocationState | null)
    ?.deployRequest;
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

    void deployTemplate({
      templateSlug,
      serverId,
      env: pendingDeploy.env,
      ports: pendingDeploy.ports,
    })
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
          `/servers/${serverId}/deploy/${templateSlug}/logs?deploymentId=${encodeURIComponent(id)}`,
          { replace: true, state: null },
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
  }, [deploymentId, navigate, pendingDeploy, serverId, templateSlug]);

  if (!serverId || !templateSlug) {
    return <Navigate to="/servers" replace />;
  }

  if (templateQuery.isPending) {
    return <DeployLogsPageSkeleton />;
  }

  if (templateQuery.isError || !templateQuery.data) {
    return <NotFoundPage />;
  }

  const template = templateQuery.data;

  return (
    <DeploymentLogs
      template={{
        id: template.slug,
        name: template.name,
        description: template.shortDescription ?? "",
        category: template.category ?? "",
        color: getTemplateAccentColor(template.slug),
        logo: template.logo ?? null,
      }}
      deploymentId={deploymentId}
      serverId={serverId}
      backHref={buildServerDetailHref(serverId, "templates")}
      isStarting={isStarting || Boolean(pendingDeploy && !deploymentId)}
      startError={startError}
    />
  );
}
