import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { DeployConfigurePageSkeleton } from "@/components/shared/skeleton";
import {
  CUSTOM_TEMPLATE_SLUG,
  type CustomComposeServiceEnvironment,
  validateCustomComposeResources,
  validateCustomComposeUpload,
} from "@/features/deployments/api/custom-compose";
import {
  CustomComposeEditor,
  type CustomComposeEditorTab,
} from "@/features/deployments/components/custom-compose-editor";
import { CustomComposeEnvPreview } from "@/features/deployments/components/custom-compose-env-preview";
import { DeployResourceWarningConfirmModal } from "@/features/deployments/components/deploy-resource-warning-confirm-modal";
import { DEPLOYMENT_VALIDATION_IN_PROGRESS_MESSAGE } from "@/features/deployments/constants/deployment-validation-messages";
import type { DeploymentResourceWarningCode } from "@/features/deployments/types";
import { DeployServiceSummaryCard } from "@/features/templates/components/deploy-service-summary-card";
import { useServerQuery } from "@/features/servers/hooks";
import type { ApiTemplate, TemplateVariable } from "@/features/templates/types";
import { getDeploymentSocket } from "@/lib/socket/deployment-socket-client";
import { showErrorToast } from "@/lib/toast";
import { NotFoundPage } from "./not-found-page";
import "./custom-compose-pages.css";
import "@/features/templates/templates-ui.css";

type CustomComposeConfigureLocationState = {
  composeYaml: string;
  envFileContent?: string;
  displayName: string;
  serverId?: string;
  variables?: TemplateVariable[];
  serviceEnvironments?: CustomComposeServiceEnvironment[];
  composeFileName?: string;
  envFileName?: string;
  backHref?: string;
};

/**
 * Edit, validate, and preview environment values for a custom compose stack.
 *
 * Receives all data (compose YAML, env, displayName, serverId) via navigation state.
 */
export function CustomComposeConfigurePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState =
    location.state as CustomComposeConfigureLocationState | null;
  const serverId = locationState?.serverId;
  const serverQuery = useServerQuery(serverId);

  const [composeYaml, setComposeYaml] = useState(locationState?.composeYaml ?? "");
  const [envFileContent, setEnvFileContent] = useState(
    locationState?.envFileContent ?? "",
  );
  const [activeTab, setActiveTab] = useState<CustomComposeEditorTab>("compose");
  const [validationIssues, setValidationIssues] = useState<
    Array<{ path: string; message: string }>
  >([]);
  const [serviceEnvironments, setServiceEnvironments] = useState<
    CustomComposeServiceEnvironment[]
  >(locationState?.serviceEnvironments ?? []);
  const [isValidated, setIsValidated] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [resourceWarningCode, setResourceWarningCode] =
    useState<DeploymentResourceWarningCode | null>(null);

  const displayName = locationState?.displayName;

  const backHref = locationState?.backHref ?? "/compose";
  const deployLogsBackHref = locationState?.backHref ?? "/compose";

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

  const summaryStatus = isValidating || isDeploying
    ? {
        type: "validating" as const,
        message: DEPLOYMENT_VALIDATION_IN_PROGRESS_MESSAGE,
      }
    : null;

  useEffect(() => {
    getDeploymentSocket();
  }, []);

  const validateContent = useCallback(
    async (yaml: string, env: string, fileName?: string) => {
      setIsValidating(true);
      setValidationIssues([]);
      setServiceEnvironments([]);
      setIsValidated(false);

      try {
        const result = await validateCustomComposeUpload({
          composeYaml: yaml,
          envFileContent: env,
          fileName,
        });

        if (!result.valid) {
          setValidationIssues(result.issues);
          return;
        }

        setServiceEnvironments(result.serviceEnvironments);
        setIsValidated(true);
      } catch (error) {
        showErrorToast(getErrorMessage(error));
      } finally {
        setIsValidating(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!locationState?.composeYaml) {
      return;
    }

    const yaml = locationState.composeYaml;
    const env = locationState.envFileContent ?? "";

    setComposeYaml(yaml);
    setEnvFileContent(env);
    setValidationIssues([]);
    setServiceEnvironments([]);
    setIsValidated(false);

    void validateContent(yaml, env, locationState.composeFileName);
  }, [locationState, validateContent]);

  if (!serverId || !locationState?.composeYaml || !displayName) {
    return <Navigate to={backHref} replace />;
  }

  if (serverQuery.isPending) {
    return (
      <div className="dashboard service-detail-page deploy-configure-page custom-compose-page">
        <BackLink to={backHref} label="Back" />
        <DeployConfigurePageSkeleton />
      </div>
    );
  }

  if (serverQuery.isError || !serverQuery.data) {
    return <NotFoundPage />;
  }

  function markContentDirty() {
    setIsValidated(false);
    setValidationIssues([]);
    setServiceEnvironments([]);
  }

  function handleValidate() {
    void validateContent(
      composeYaml,
      envFileContent,
      locationState?.composeFileName,
    );
  }

  function proceedToDeployLogs(acknowledgeResourceWarning = false) {
    if (!serverId || !displayName) {
      return;
    }

    navigate(
      `/servers/${encodeURIComponent(serverId)}/deploy/${encodeURIComponent(CUSTOM_TEMPLATE_SLUG)}/logs`,
      {
        state: {
          deployRequest: {
            serverId,
            templateSlug: CUSTOM_TEMPLATE_SLUG,
            composeYaml,
            envFileContent,
            displayName,
            env: {},
            ports: {},
            acknowledgeResourceWarning,
          },
          backHref: deployLogsBackHref,
        },
      },
    );
  }

  async function handleDeploy() {
    if (!isValidated || validationIssues.length > 0 || !serverId || !displayName) {
      showErrorToast("Validate your configuration before deploying.");
      return;
    }

    setIsDeploying(true);
    try {
      const validation = await validateCustomComposeResources({
        composeYaml,
        envFileContent,
        serverId,
        displayName,
      });

      if (!validation.ok) {
        setResourceWarningCode(validation.warning.code);
        return;
      }

      proceedToDeployLogs();
    } catch (error) {
      showErrorToast(getErrorMessage(error));
    } finally {
      setIsDeploying(false);
    }
  }

  function handleCancelResourceWarning() {
    setResourceWarningCode(null);
  }

  function handleConfirmResourceWarning() {
    setResourceWarningCode(null);
    proceedToDeployLogs(true);
  }

  const isBusy = isValidating || isDeploying;
  const canDeploy = isValidated && validationIssues.length === 0;

  return (
    <div className="dashboard service-detail-page deploy-configure-page custom-compose-page">
      {resourceWarningCode ? (
        <DeployResourceWarningConfirmModal
          warningCode={resourceWarningCode}
          isPending={false}
          onCancel={handleCancelResourceWarning}
          onConfirm={handleConfirmResourceWarning}
        />
      ) : null}
      <BackLink to={backHref} label="Back" />

      <div className="deploy-configure-layout">
        <DeployServiceSummaryCard
          template={syntheticTemplate}
          serverName={serverQuery.data.name}
          serverId={serverId}
          variableCount={
            isValidated
              ? serviceEnvironments.reduce(
                  (count, service) => count + Object.keys(service.env).length,
                  0,
                )
              : (locationState?.variables?.length ?? 0)
          }
          status={summaryStatus}
        />

        <div className="deploy-configure-main">
          <header className="deploy-configure-main-header">
            <div>
              <h1>Configure deployment</h1>
              <p>
                Edit your compose and environment files, then validate to preview
                resolved values by service.
                {!isValidated ? " Changes must be validated before preview." : null}
              </p>
            </div>
            <button
              type="button"
              className={`btn-secondary deploy-configure-edit-btn${isValidating ? " is-loading" : ""}`}
              disabled={isBusy}
              aria-busy={isValidating}
              onClick={() => void handleValidate()}
            >
              Validate
            </button>
          </header>

          <div className="deploy-configure-form">
            <div className="deploy-configure-form-content">
              <div className="deploy-vars-panel">
                <section className="deploy-vars-section">
                  <header className="deploy-vars-section-header">
                    <h2>Configuration files</h2>
                    <p>
                      {locationState.composeFileName
                        ? `Compose: ${locationState.composeFileName}`
                        : "docker-compose.yml"}
                      {locationState.envFileName
                        ? ` · Env: ${locationState.envFileName}`
                        : envFileContent.trim()
                          ? " · .env"
                          : ""}
                    </p>
                  </header>

                  <CustomComposeEditor
                    composeYaml={composeYaml}
                    envFileContent={envFileContent}
                    activeTab={activeTab}
                    onComposeChange={(value) => {
                      setComposeYaml(value);
                      markContentDirty();
                    }}
                    onEnvChange={(value) => {
                      setEnvFileContent(value);
                      markContentDirty();
                    }}
                    onTabChange={setActiveTab}
                    disabled={isBusy}
                  />
                </section>

                {validationIssues.length > 0 ? (
                  <section className="deploy-vars-section">
                    <header className="deploy-vars-section-header">
                      <h2>Validation errors</h2>
                      <p>Fix the issues below and validate again.</p>
                    </header>
                    <ul
                      className="custom-compose-validation-issues"
                      role="alert"
                    >
                      {validationIssues.map((issue) => (
                        <li key={`${issue.path}-${issue.message}`}>
                          <strong>{issue.path}</strong>: {issue.message}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {isValidated ? (
                  <section className="deploy-vars-section">
                    <header className="deploy-vars-section-header">
                      <h2>Environment preview by service</h2>
                    </header>
                    <CustomComposeEnvPreview
                      serviceEnvironments={serviceEnvironments}
                      composeYaml={composeYaml}
                      envFileContent={envFileContent}
                    />
                  </section>
                ) : null}
              </div>
            </div>

            <footer className="deploy-configure-actions">
              <button
                type="button"
                className={`btn-primary deploy-configure-action-btn${isDeploying ? " is-loading" : ""}`}
                disabled={!canDeploy || isBusy}
                aria-busy={isDeploying}
                onClick={() => void handleDeploy()}
              >
                Deploy
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
