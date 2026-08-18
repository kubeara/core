import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { BackLink } from "@/components/shared/back-link";
import { CUSTOM_TEMPLATE_SLUG } from "@/features/deployments/api/custom-compose";
import {
  ComposeUploadForm,
  type ComposeUploadFormData,
} from "@/features/deployments/components/compose-upload-form";
import { SelectDeployServerModal } from "@/features/templates/components/select-deploy-server-modal";
import type { ApiTemplate } from "@/features/templates/types";
import "./custom-compose-pages.css";
import "./global-compose-page.css";

/**
 * Global Compose deployment page.
 *
 * Allows users to upload a Docker Compose YAML and optional .env file
 * without first navigating to a specific server. After filling out the form,
 * a server-picker modal is shown, and deployment continues via the existing
 * custom-compose configure flow.
 */
export function GlobalComposePage() {
  const navigate = useNavigate();
  const [showServerPicker, setShowServerPicker] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<ComposeUploadFormData | null>(null);

  const syntheticTemplate = useMemo<ApiTemplate>(
    () => ({
      slug: CUSTOM_TEMPLATE_SLUG,
      name: "Custom Compose",
      shortDescription: "User-uploaded Docker Compose stack",
      category: ["custom"],
      tags: ["custom", "compose"],
      port: null,
      variables: [],
    }),
    [],
  );

  function handleFormSubmit(data: ComposeUploadFormData) {
    setPendingFormData(data);
    setShowServerPicker(true);
  }

  function handleSelectServer(serverId: string) {
    if (!pendingFormData) return;
    setShowServerPicker(false);
    navigate("/custom-compose/configure", {
      state: {
        ...pendingFormData,
        serverId,
        backHref: "/compose",
      },
    });
    setPendingFormData(null);
  }

  function handleCloseServerPicker() {
    setShowServerPicker(false);
  }

  return (
    <div className="dashboard service-detail-page custom-compose-page deploy-configure-page global-compose-page">
      <BackLink to="/servers" label="Back" />

      <div className="deploy-configure-main custom-compose-upload-panel">
        <header className="deploy-configure-main-header custom-compose-upload-header">
          <div>
            <h1>Upload custom compose</h1>
            <p>
              Enter a deployment name and upload docker-compose.yml with an optional .env,
              then select a server to deploy to.
            </p>
          </div>
        </header>

        <ComposeUploadForm onSubmit={handleFormSubmit} />
      </div>

      <SelectDeployServerModal
        open={showServerPicker}
        template={syntheticTemplate}
        onClose={handleCloseServerPicker}
        onSelectServer={handleSelectServer}
      />
    </div>
  );
}
