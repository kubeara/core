import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TemplatesMarketplacePanel } from "@/features/templates/components/templates-marketplace-panel";
import { SelectDeployServerModal } from "@/features/templates/components/select-deploy-server-modal";
import type { ApiTemplate } from "@/features/templates/types";
import "@/features/templates/templates-ui.css";

/**
 * Global services marketplace page.
 *
 * Browse deployable templates and pick a target server before configuring
 * deployment. Server selection uses a modal; deploy configure/logs flow is
 * unchanged from the per-server Services tab.
 */
export function ServicesPage() {
  const navigate = useNavigate();
  const [deployTemplate, setDeployTemplate] = useState<ApiTemplate | null>(null);

  function handleDeploy(template: ApiTemplate) {
    setDeployTemplate(template);
  }

  function handleCloseModal() {
    setDeployTemplate(null);
  }

  function handleSelectServer(serverId: string) {
    if (!deployTemplate) return;
    navigate(`/servers/${serverId}/deploy/${deployTemplate.slug}`);
    setDeployTemplate(null);
  }

  return (
    <div className="dashboard services-page">
      <header className="dashboard-header">
        <div>
          <h1>Services</h1>
          <p>
            Browse the marketplace and deploy services to your servers.
          </p>
        </div>
      </header>

      <TemplatesMarketplacePanel onDeploy={handleDeploy} />

      <SelectDeployServerModal
        open={deployTemplate !== null}
        template={deployTemplate}
        onClose={handleCloseModal}
        onSelectServer={handleSelectServer}
      />
    </div>
  );
}
