import { useNavigate } from "react-router-dom";
import { TemplatesMarketplacePanel } from "./templates-marketplace-panel";
import type { ApiTemplate } from "../types";

type ServerTemplatesPanelProps = {
  serverId: string;
  connectedTemplateSlugs?: Set<string>;
};

/**
 * Template marketplace scoped to a specific server (Services tab).
 * Deploy navigates directly — no server picker modal.
 */
export function ServerTemplatesPanel({
  serverId,
  connectedTemplateSlugs = new Set(),
}: ServerTemplatesPanelProps) {
  const navigate = useNavigate();

  function handleDeploy(template: ApiTemplate) {
    navigate(`/servers/${serverId}/deploy/${template.slug}`);
  }

  return (
    <TemplatesMarketplacePanel
      serverId={serverId}
      connectedTemplateSlugs={connectedTemplateSlugs}
      onDeploy={handleDeploy}
    />
  );
}
