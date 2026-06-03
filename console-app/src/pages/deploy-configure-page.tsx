import { Navigate, useParams } from "react-router-dom";
import { BackLink } from "@/components/shared/back-link";
import { DeployConfigurationForm } from "@/features/templates/components/deploy-configuration-form";
import { useTemplateDetailsQuery, useTemplatesQuery } from "@/features/templates/hooks";
import { useServerQuery } from "@/features/servers/hooks";
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
  const templatesQuery = useTemplatesQuery(serverId);
  const detailsQuery = useTemplateDetailsQuery(templateSlug);

  if (!serverId || !templateSlug) {
    return <Navigate to="/servers" replace />;
  }

  const backHref = `/servers/${serverId}`;

  if (
    serverQuery.isPending ||
    templatesQuery.isPending ||
    detailsQuery.isPending
  ) {
    return (
      <div className="dashboard deploy-configure-page">
        <BackLink to={backHref} label="Back to server" />
        <div className="deploy-configure-page-loading" aria-live="polite">
          <div className="deploy-form-loading-dots" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <p>Loading deployment configuration…</p>
        </div>
      </div>
    );
  }

  if (serverQuery.isError || !serverQuery.data) {
    return <NotFoundPage />;
  }

  const listTemplate = templatesQuery.data?.find((t) => t.slug === templateSlug);
  const template = detailsQuery.data ?? listTemplate;

  if (!template) {
    return <NotFoundPage />;
  }

  return (
    <div className="dashboard deploy-configure-page">
      <BackLink to={backHref} label="Back to server" />
      <DeployConfigurationForm
        template={template}
        serverId={serverId}
        serverName={serverQuery.data.name}
        cancelHref={backHref}
      />
    </div>
  );
}
