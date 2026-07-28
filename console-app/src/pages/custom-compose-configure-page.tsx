import { useMemo } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { BackLink } from "@/components/shared/back-link";
import { DeployConfigurePageSkeleton } from "@/components/shared/skeleton";
import { CUSTOM_TEMPLATE_SLUG } from "@/features/deployments/api/custom-compose";
import { DeployConfigurationForm } from "@/features/templates/components/deploy-configuration-form";
import type { ApiTemplate, TemplateVariable } from "@/features/templates/types";
import { useServerQuery } from "@/features/servers/hooks";
import { NotFoundPage } from "./not-found-page";
import "@/features/templates/templates-ui.css";

type CustomComposeConfigureLocationState = {
  composeYaml: string;
  displayName: string;
  variables: TemplateVariable[];
  fileName?: string;
};

/**
 * Thin route wrapper: configures a custom compose deploy via DeployConfigurationForm.
 */
export function CustomComposeConfigurePage() {
  const { serverId } = useParams<{ serverId: string }>();
  const location = useLocation();
  const locationState =
    location.state as CustomComposeConfigureLocationState | null;
  const serverQuery = useServerQuery(serverId);

  const composeYaml = locationState?.composeYaml;
  const displayName = locationState?.displayName;

  const syntheticTemplate = useMemo<ApiTemplate>(() => {
    const resolvedName = displayName?.trim() || "Custom Compose";

    return {
      slug: CUSTOM_TEMPLATE_SLUG,
      name: resolvedName,
      shortDescription: "User-uploaded Docker Compose stack",
      category: ["custom"],
      tags: ["custom", "compose"],
      port: null,
      variables: locationState?.variables ?? [],
    };
  }, [displayName, locationState?.variables]);

  if (!serverId) {
    return <Navigate to="/servers" replace />;
  }

  const backHref = `/servers/${encodeURIComponent(serverId)}/custom-compose/upload`;

  if (!composeYaml || !displayName) {
    return <Navigate to={backHref} replace />;
  }

  if (serverQuery.isPending) {
    return (
      <div className="dashboard service-detail-page deploy-configure-page">
        <BackLink to={backHref} label="Back" />
        <DeployConfigurePageSkeleton />
      </div>
    );
  }

  if (serverQuery.isError || !serverQuery.data) {
    return <NotFoundPage />;
  }

  return (
    <div className="dashboard service-detail-page deploy-configure-page">
      <BackLink to={backHref} label="Back" />
      <DeployConfigurationForm
        template={syntheticTemplate}
        serverId={serverId}
        serverName={serverQuery.data.name}
        customCompose={{ composeYaml, displayName }}
      />
    </div>
  );
}
