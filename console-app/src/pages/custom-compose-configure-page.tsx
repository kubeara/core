import { useMemo } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { BackLink } from "@/components/shared/back-link";
import { DeployConfigurePageSkeleton } from "@/components/shared/skeleton";
import { formatCustomComposeTemplateSlugLabel } from "@/features/deployments/api/custom-compose";
import { DeployConfigurationForm } from "@/features/templates/components/deploy-configuration-form";
import type { ApiTemplate, TemplateVariable } from "@/features/templates/types";
import { useServerQuery } from "@/features/servers/hooks";
import { NotFoundPage } from "./not-found-page";
import "@/features/templates/templates-ui.css";

type CustomComposeConfigureLocationState = {
  composeYaml: string;
  templateSlug: string;
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
  const templateSlug = locationState?.templateSlug;

  const serviceLabel = (() => {
    try {
      return templateSlug
        ? formatCustomComposeTemplateSlugLabel(templateSlug)
        : "Custom Compose";
    } catch {
      return "Custom Compose";
    }
  })();

  const syntheticTemplate = useMemo<ApiTemplate>(() => {
    try {
      return {
        slug: templateSlug ?? "custom-compose",
        name: serviceLabel,
        shortDescription: "User-uploaded Docker Compose stack",
        category: ["custom"],
        tags: ["custom", "compose"],
        port: null,
        variables: locationState?.variables ?? [],
      };
    } catch {
      return {
        slug: templateSlug ?? "custom-compose",
        name: serviceLabel,
        shortDescription: "User-uploaded Docker Compose stack",
        category: ["custom"],
        tags: ["custom", "compose"],
        port: null,
        variables: [],
      };
    }
  }, [locationState?.variables, serviceLabel, templateSlug]);

  if (!serverId) {
    return <Navigate to="/servers" replace />;
  }

  const backHref = `/servers/${encodeURIComponent(serverId)}/custom-compose/upload`;

  if (!composeYaml || !templateSlug) {
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
        customCompose={{ composeYaml }}
      />
    </div>
  );
}
