import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { useTemplatesQuery } from "../hooks";
import { SkeletonMarketplaceGrid } from "@/components/shared/skeleton";
import { MarketplaceTemplateCard } from "./marketplace-template-card";
import type { ApiTemplate } from "../types";
import "../templates-ui.css";

type ServerTemplatesPanelProps = {
  serverId: string;
  connectedTemplateSlugs?: Set<string>;
};

export function ServerTemplatesPanel({
  serverId,
  connectedTemplateSlugs = new Set(),
}: ServerTemplatesPanelProps) {
  const navigate = useNavigate();
  const templatesQuery = useTemplatesQuery(serverId);

  function handleDeploy(template: ApiTemplate) {
    navigate(`/servers/${serverId}/deploy/${template.slug}`);
  }

  if (templatesQuery.isPending) {
    return <SkeletonMarketplaceGrid count={6} label="Loading templates…" />;
  }

  if (templatesQuery.isError) {
    return (
      <div className="server-templates-state server-templates-state-error">
        <p className="server-templates-state-title">Unable to load templates</p>
        <p className="server-templates-state-text">
          {getErrorMessage(templatesQuery.error)}
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void templatesQuery.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  const templates = templatesQuery.data ?? [];

  if (templates.length === 0) {
    return (
      <div className="server-templates-state">
        <p className="server-templates-state-title">No templates available</p>
        <p className="server-templates-state-text">
          There are no deployable templates for this server yet.
        </p>
      </div>
    );
  }

  return (
    <div className="server-templates-grid">
      {templates.map((template) => (
        <MarketplaceTemplateCard
          key={template.slug}
          template={template}
          isDeployed={connectedTemplateSlugs.has(template.slug)}
          onDeploy={handleDeploy}
        />
      ))}
    </div>
  );
}
