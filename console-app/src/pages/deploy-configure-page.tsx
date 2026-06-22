import { Navigate, useParams } from "react-router-dom";
import { BackLink } from "@/components/shared/back-link";
import { DeployConfigurationForm } from "@/features/templates/components/deploy-configuration-form";
import { useTemplateDetailsQuery } from "@/features/templates/hooks";
import { useServerQuery } from "@/features/servers/hooks";
import { DeployConfigurePageSkeleton } from "@/components/shared/skeleton";
import { buildServerDetailHref } from "@/features/servers/components/server-detail/utils/server-detail-tab-url";
import { NotFoundPage } from "./not-found-page";
import "@/features/templates/templates-ui.css";

/**
 * Dedicated page for configuring template env variables before deploy.
 *
 * URL: /servers/:serverId/deploy/:templateSlug
 */
export function DeployConfigurePage() {
  const { serverId, templateSlug } = useParams<{
    serverId: string;
    templateSlug: string;
  }>();

  const serverQuery = useServerQuery(serverId);
  const detailsQuery = useTemplateDetailsQuery(templateSlug);

  if (!serverId || !templateSlug) {
    return <Navigate to="/servers" replace />;
  }

  const backHref = buildServerDetailHref(serverId, "templates");

  if (serverQuery.isPending || detailsQuery.isPending) {
    return (
      <div className="dashboard deploy-configure-page">
        <BackLink to={backHref} label="Back" />
        <DeployConfigurePageSkeleton />
      </div>
    );
  }

  if (serverQuery.isError || !serverQuery.data) {
    return <NotFoundPage />;
  }

  const template = detailsQuery.data;

  if (!template) {
    return <NotFoundPage />;
  }

  return (
    <div className="dashboard deploy-configure-page">
      <BackLink to={backHref} label="Back" />
      <DeployConfigurationForm
        template={template}
        serverId={serverId}
        serverName={serverQuery.data.name}
      />
    </div>
  );
}
