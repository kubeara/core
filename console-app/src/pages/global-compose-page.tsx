import { useState } from "react";
import { BackLink } from "@/components/shared/back-link";
import { CustomComposeStepper } from "@/features/deployments/components/custom-compose-stepper";
import { DEPLOYMENT_VALIDATION_IN_PROGRESS_MESSAGE } from "@/features/deployments/constants/deployment-validation-messages";
import "./custom-compose-pages.css";
import "./global-compose-page.css";
import "@/features/templates/templates-ui.css";

/**
 * Global Compose deployment page.
 *
 * Guides the user through upload, environment, server selection, and deploy.
 */
export function GlobalComposePage() {
  const [isResourceValidating, setIsResourceValidating] = useState(false);

  return (
    <div className="dashboard service-detail-page custom-compose-page deploy-configure-page global-compose-page">
      <BackLink to="/servers" label="Back" />

      <div className="deploy-configure-main custom-compose-upload-panel">
        <header className="deploy-configure-main-header custom-compose-upload-header">
          <div className="custom-compose-upload-header-copy">
            <h1>Deploy custom compose</h1>
            <p className="custom-compose-page-subtitle">
              Upload a Docker Compose file, configure environment values, choose
              a server, and review before deploying.
            </p>
          </div>
          {isResourceValidating ? (
            <span
              className="deploy-service-status deploy-service-status-validating"
              role="status"
              aria-live="polite"
            >
              {DEPLOYMENT_VALIDATION_IN_PROGRESS_MESSAGE}
            </span>
          ) : null}
        </header>

        <CustomComposeStepper
          onResourceValidatingChange={setIsResourceValidating}
        />
      </div>
    </div>
  );
}
