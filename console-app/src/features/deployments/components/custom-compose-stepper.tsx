import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getErrorMessage } from "@/api/api-error";
import { Dropdown } from "@/components/shared/dropdown";
import { SensitiveHost } from "@/components/shared/sensitive-host";
import {
  Stepper,
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperNext,
  StepperPrev,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";
import {
  CUSTOM_TEMPLATE_SLUG,
  getCustomComposeDisplayNameValidationError,
  normalizeCustomComposeDisplayName,
  validateCustomComposeResources,
  validateCustomComposeUpload,
  type CustomComposeServiceEnvironment,
} from "@/features/deployments/api/custom-compose";
import { ComposeUploadForm } from "@/features/deployments/components/compose-upload-form";
import { CustomComposeEditor } from "@/features/deployments/components/custom-compose-editor";
import { CustomComposeEnvConfig } from "@/features/deployments/components/custom-compose-env-config";
import { DeployResourceWarningConfirmModal } from "@/features/deployments/components/deploy-resource-warning-confirm-modal";
import {
  CUSTOM_COMPOSE_STEPS,
  type CustomComposeStepValue,
} from "@/features/deployments/constants/custom-compose-stepper";
import type { DeploymentResourceWarningCode } from "@/features/deployments/types";
import {
  buildResolvedComposePreview,
  enrichServiceEnvironmentsFromEditor,
  injectServiceEnvironmentsIntoCompose,
  mergePreservedServiceEnvironments,
  normalizeServiceEnvValue,
  serializeServiceEnvironmentsToEnvFile,
} from "@/features/deployments/utils/custom-compose-env-preview.util";
import { useServerQuery, useServersQuery } from "@/features/servers/hooks";
import {
  isServerOperationBusy,
  mapServerApiToServer,
} from "@/features/servers/types";
import { getDeploymentSocket } from "@/lib/socket/deployment-socket-client";
import { showErrorToast } from "@/lib/toast";

type ValidationIssue = { path: string; message: string };

const SERVER_LIST_LIMIT = 100;
/** Tab-scoped draft so refresh keeps the upload. Cleared when leaving /compose. */
const CUSTOM_COMPOSE_DRAFT_KEY = "kubeara:custom-compose-draft";

type CustomComposeDraft = {
  step: CustomComposeStepValue;
  completedSteps: CustomComposeStepValue[];
  displayName: string;
  composeYaml: string;
  composeFileName: string;
  serviceEnvironments: CustomComposeServiceEnvironment[];
  baselineServiceEnvironments: CustomComposeServiceEnvironment[];
  serverId: string;
};

function readDraft(): CustomComposeDraft | null {
  try {
    const raw = sessionStorage.getItem(CUSTOM_COMPOSE_DRAFT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CustomComposeDraft;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(draft: CustomComposeDraft): void {
  try {
    sessionStorage.setItem(CUSTOM_COMPOSE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function clearDraft(): void {
  try {
    sessionStorage.removeItem(CUSTOM_COMPOSE_DRAFT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/** Bumps on each mount so Strict Mode remount does not wipe a restored draft. */
let composeDraftMountGeneration = 0;

function toEditableServiceEnvironments(
  services: CustomComposeServiceEnvironment[],
): CustomComposeServiceEnvironment[] {
  return services.map((service) => ({
    serviceName: service.serviceName,
    env: Object.fromEntries(
      Object.entries(service.env).map(([key, value]) => [
        key,
        normalizeServiceEnvValue(value),
      ]),
    ),
  }));
}

/**
 * Four-step custom Docker Compose deployment flow.
 */
export function CustomComposeStepper({
  onResourceValidatingChange,
}: {
  onResourceValidatingChange?: (isValidating: boolean) => void;
} = {}) {
  const navigate = useNavigate();
  const initialDraft = useMemo(() => readDraft(), []);

  const [step, setStep] = useState<CustomComposeStepValue>(
    initialDraft?.step ?? "upload",
  );
  const [completedSteps, setCompletedSteps] = useState<
    Set<CustomComposeStepValue>
  >(() => new Set(initialDraft?.completedSteps ?? []));
  const [displayName, setDisplayName] = useState(
    initialDraft?.displayName ?? "",
  );
  const [composeYaml, setComposeYaml] = useState(
    initialDraft?.composeYaml ?? "",
  );
  const [composeFileName, setComposeFileName] = useState(
    initialDraft?.composeFileName ?? "",
  );
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [uploadIssues, setUploadIssues] = useState<ValidationIssue[]>([]);
  const [envIssues, setEnvIssues] = useState<ValidationIssue[]>([]);
  const [envError, setEnvError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serviceEnvironments, setServiceEnvironments] = useState<
    CustomComposeServiceEnvironment[]
  >(initialDraft?.serviceEnvironments ?? []);
  const [baselineServiceEnvironments, setBaselineServiceEnvironments] =
    useState<CustomComposeServiceEnvironment[]>(
      initialDraft?.baselineServiceEnvironments ?? [],
    );
  const [serverId, setServerId] = useState(initialDraft?.serverId ?? "");
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [resourceWarningCode, setResourceWarningCode] =
    useState<DeploymentResourceWarningCode | null>(null);

  const serverQuery = useServerQuery(serverId || undefined);
  const serversQuery = useServersQuery({
    page: 1,
    limit: SERVER_LIST_LIMIT,
    sortBy: "name",
    sortOrder: "asc",
  });
  const servers = useMemo(
    () => (serversQuery.data?.data ?? []).map(mapServerApiToServer),
    [serversQuery.data?.data],
  );

  const envFileContent = useMemo(
    () => serializeServiceEnvironmentsToEnvFile(serviceEnvironments),
    [serviceEnvironments],
  );
  const deployComposeYaml = useMemo(
    () =>
      injectServiceEnvironmentsIntoCompose(composeYaml, serviceEnvironments),
    [composeYaml, serviceEnvironments],
  );
  const resolvedComposeYaml = useMemo(
    () => buildResolvedComposePreview(composeYaml, serviceEnvironments),
    [composeYaml, serviceEnvironments],
  );

  useEffect(() => {
    onResourceValidatingChange?.(isDeploying);
  }, [isDeploying, onResourceValidatingChange]);

  useEffect(() => {
    writeDraft({
      step,
      completedSteps: Array.from(completedSteps),
      displayName,
      composeYaml,
      composeFileName,
      serviceEnvironments,
      baselineServiceEnvironments,
      serverId,
    });
  }, [
    step,
    completedSteps,
    displayName,
    composeYaml,
    composeFileName,
    serviceEnvironments,
    baselineServiceEnvironments,
    serverId,
  ]);

  // Keep draft across refresh; clear only when navigating away from /compose.
  useEffect(() => {
    const mountGeneration = ++composeDraftMountGeneration;
    let keepDraftAcrossUnload = false;

    function handlePageHide() {
      keepDraftAcrossUnload = true;
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (keepDraftAcrossUnload) {
        return;
      }

      // Defer so React Strict Mode remount can cancel the clear.
      window.setTimeout(() => {
        if (mountGeneration === composeDraftMountGeneration) {
          clearDraft();
        }
      }, 0);
    };
  }, []);

  function clearAllErrors() {
    setDisplayNameError(null);
    setComposeError(null);
    setUploadIssues([]);
    setEnvError(null);
    setEnvIssues([]);
    setServerError(null);
  }

  /**
   * Marks the current step as completed.
   * @param value The step value to mark as completed.
   */
  function markStepCompleted(value: CustomComposeStepValue) {
    setCompletedSteps((current) => new Set(current).add(value));
  }

  /**
   * Invalidates the steps from the current step to the end of the steps.
   * @param value The step to invalidate from.
   */
  function invalidateFrom(value: CustomComposeStepValue) {
    const startIndex = CUSTOM_COMPOSE_STEPS.findIndex(
      (item) => item.value === value,
    );
    setCompletedSteps((current) => {
      const next = new Set(current);
      for (const item of CUSTOM_COMPOSE_STEPS.slice(startIndex)) {
        next.delete(item.value);
      }
      return next;
    });
  }

  /**
   * Updates the current step for the custom compose deployment.
   * @param nextValue The new step value.
   */
  function handleStepChange(nextValue: string) {
    const nextStep = nextValue as CustomComposeStepValue;
    const nextIndex = CUSTOM_COMPOSE_STEPS.findIndex(
      (item) => item.value === nextStep,
    );
    const currentIndex = CUSTOM_COMPOSE_STEPS.findIndex(
      (item) => item.value === step,
    );

    if (nextIndex < currentIndex) {
      invalidateFrom(nextStep);
    }

    setStep(nextStep);
  }

  /**
   * Updates the Docker Compose file and file name for the custom compose deployment.
   * @param yaml The new Docker Compose file.
   * @param fileName The new file name.
   */
  function handleComposeLoaded(yaml: string, fileName: string) {
    setComposeYaml(yaml);
    setComposeFileName(fileName);
    setComposeError(null);
    setUploadIssues([]);
    invalidateFrom("upload");
  }

  /**
   * Updates the Docker Compose file for the custom compose deployment.
   * @param yaml The new Docker Compose file.
   */
  function handleComposeChange(yaml: string) {
    setComposeYaml(yaml);
    setComposeError(null);
    setUploadIssues([]);
    invalidateFrom("upload");
  }

  /**
   * Clears the Docker Compose file and service environments for the custom compose deployment.
   */
  function handleComposeClear() {
    setComposeYaml("");
    setComposeFileName("");
    setComposeError(null);
    setUploadIssues([]);
    setServiceEnvironments([]);
    setBaselineServiceEnvironments([]);
    invalidateFrom("upload");
  }

  /**
   * Updates the display name for the custom compose deployment.
   * @param value The new display name.
   */
  function handleDisplayNameChange(value: string) {
    setDisplayName(value);
    if (displayNameError) {
      setDisplayNameError(null);
    }
    invalidateFrom("upload");
  }

  /**
   * Updates the service environments for the custom compose deployment.
   * @param next The new service environments.
   */
  function handleServiceEnvironmentsChange(
    next: CustomComposeServiceEnvironment[],
  ) {
    setServiceEnvironments(next);
    setEnvIssues([]);
    setEnvError(null);
    invalidateFrom("environment");
  }

  /**
   * Validates the Docker Compose file for the custom compose deployment.
   * @returns True if the Docker Compose file is valid, false otherwise.
   */
  async function validateUploadStep(): Promise<boolean> {
    const nameError = getCustomComposeDisplayNameValidationError(displayName);
    setDisplayNameError(nameError);

    if (!composeYaml.trim()) {
      setComposeError("Please select a Docker Compose file");
      return false;
    }

    if (nameError) {
      return false;
    }

    setIsValidating(true);
    setComposeError(null);
    setUploadIssues([]);

    try {
      const result = await validateCustomComposeUpload({
        composeYaml,
        fileName: composeFileName,
        skipMissingVariables: true,
      });

      if (!result.valid) {
        setUploadIssues(result.issues);
        setComposeError("Fix the compose errors below before continuing.");
        return false;
      }

      const enriched = toEditableServiceEnvironments(
        enrichServiceEnvironmentsFromEditor(
          result.serviceEnvironments,
          composeYaml,
          "",
        ),
      );
      const merged = mergePreservedServiceEnvironments(
        serviceEnvironments,
        enriched,
      );
      setServiceEnvironments(merged);
      setBaselineServiceEnvironments(merged);
      markStepCompleted("upload");
      return true;
    } catch (error) {
      showErrorToast(getErrorMessage(error));
      return false;
    } finally {
      setIsValidating(false);
    }
  }

  /**
   * Validates the environment variables for the custom compose deployment.
   * @returns True if the environment variables are valid, false otherwise.
   */
  async function validateEnvironmentStep(): Promise<boolean> {
    setIsValidating(true);
    setEnvError(null);
    setEnvIssues([]);

    try {
      const result = await validateCustomComposeUpload({
        composeYaml,
        envFileContent,
        fileName: composeFileName,
      });

      if (!result.valid) {
        setEnvIssues(result.issues);
        setEnvError("Fill all the required environment variables");
        return false;
      }

      setServiceEnvironments(
        mergePreservedServiceEnvironments(
          serviceEnvironments,
          toEditableServiceEnvironments(
            enrichServiceEnvironmentsFromEditor(
              result.serviceEnvironments,
              composeYaml,
              envFileContent,
            ),
          ),
        ),
      );
      markStepCompleted("environment");
      return true;
    } catch (error) {
      showErrorToast(getErrorMessage(error));
      return false;
    } finally {
      setIsValidating(false);
    }
  }

  /**
   * Validates the server for the custom compose deployment.
   * @returns True if the server is valid, false otherwise.
   */
  async function validateServerStep(): Promise<boolean> {
    setIsValidating(true);
    try {
      if (!serverId) {
        setServerError("Select a server to continue.");
        return false;
      }

      const selected = servers.find((server) => server.id === serverId);
      if (selected && isServerOperationBusy(selected.operationStatus)) {
        setServerError("This server is busy. Choose another server.");
        return false;
      }

      setServerError(null);
      markStepCompleted("server");
      return true;
    } finally {
      setIsValidating(false);
    }
  }

  /**
   * Validates the step for the custom compose deployment.
   * @param stepValue The step value to validate.
   * @returns True if the step is valid, false otherwise.
   */
  async function validateStep(
    stepValue: CustomComposeStepValue,
  ): Promise<boolean> {
    if (stepValue === "upload") {
      return validateUploadStep();
    }

    if (stepValue === "environment") {
      return validateEnvironmentStep();
    }

    if (stepValue === "server") {
      return validateServerStep();
    }

    return true;
  }

  /**
   * Validates the step for the custom compose deployment.
   * @param nextValue The next step value.
   * @param direction The direction to validate.
   * @returns True if the step is valid, false otherwise.
   */
  async function handleValidate(nextValue: string, direction: "next" | "prev") {
    const destination = nextValue as CustomComposeStepValue;

    if (direction === "prev") {
      clearAllErrors();
      invalidateFrom(destination);
      await validateStep(destination);
      return true;
    }

    return validateStep(step);
  }

  function proceedToDeployLogs(acknowledgeResourceWarning = false) {
    if (!serverId) {
      return;
    }

    clearDraft();
    navigate(
      `/servers/${encodeURIComponent(serverId)}/deploy/${encodeURIComponent(CUSTOM_TEMPLATE_SLUG)}/logs`,
      {
        state: {
          deployRequest: {
            serverId,
            templateSlug: CUSTOM_TEMPLATE_SLUG,
            composeYaml: deployComposeYaml,
            envFileContent,
            displayName: normalizeCustomComposeDisplayName(displayName),
            env: {},
            ports: {},
            acknowledgeResourceWarning,
          },
          backHref: "/compose",
        },
      },
    );
  }

  /**
   * Handles the deployment of the custom compose deployment.
   */
  async function handleDeploy() {
    const envValid = await validateEnvironmentStep();
    if (!envValid) {
      setStep("environment");
      return;
    }

    const serverValid = await validateServerStep();
    if (!serverValid) {
      setStep("server");
      return;
    }

    setIsDeploying(true);
    try {
      getDeploymentSocket();
      const validation = await validateCustomComposeResources({
        composeYaml,
        envFileContent,
        serverId,
        displayName: normalizeCustomComposeDisplayName(displayName),
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

  const isBusy = isValidating || isDeploying;
  const currentIndex = CUSTOM_COMPOSE_STEPS.findIndex(
    (item) => item.value === step,
  );
  const isFirstStep = step === "upload";
  const isLastStep = step === "review";

  return (
    <div className="custom-compose-stepper">
      {resourceWarningCode ? (
        <DeployResourceWarningConfirmModal
          warningCode={resourceWarningCode}
          isPending={false}
          onCancel={() => setResourceWarningCode(null)}
          onConfirm={() => {
            setResourceWarningCode(null);
            proceedToDeployLogs(true);
          }}
        />
      ) : null}

      <Stepper
        value={step}
        onValueChange={handleStepChange}
        onValidate={handleValidate}
      >
        <StepperList>
          {CUSTOM_COMPOSE_STEPS.map((item, index) => {
            const isCompleted = completedSteps.has(item.value);
            const isPending = index > currentIndex && !isCompleted;

            return (
              <StepperItem
                key={item.value}
                value={item.value}
                completed={isCompleted}
                disabled={isBusy || isPending}
              >
                <StepperTrigger>
                  <StepperIndicator />
                  <span>
                    <StepperTitle>{item.title}</StepperTitle>
                    <StepperDescription>{item.description}</StepperDescription>
                  </span>
                </StepperTrigger>
                <StepperSeparator />
              </StepperItem>
            );
          })}
        </StepperList>

        <div className="custom-compose-stepper-body">
          <StepperContent value="upload" className="custom-compose-step-panel">
            <ComposeUploadForm
              disabled={isBusy}
              displayName={displayName}
              composeYaml={composeYaml}
              composeFileName={composeFileName}
              displayNameError={displayNameError}
              composeError={composeError}
              onDisplayNameChange={handleDisplayNameChange}
              onComposeLoaded={handleComposeLoaded}
              onComposeChange={handleComposeChange}
              onComposeClear={handleComposeClear}
            />
            {uploadIssues.length > 0 ? (
              <ul className="custom-compose-validation-issues" role="alert">
                {uploadIssues.map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    <strong>{issue.path}</strong>: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </StepperContent>

          <StepperContent
            value="environment"
            className="custom-compose-step-panel"
          >
            <CustomComposeEnvConfig
              serviceEnvironments={serviceEnvironments}
              baselineServiceEnvironments={baselineServiceEnvironments}
              disabled={isBusy}
              errorMessage={envError}
              issues={envIssues}
              onServiceEnvironmentsChange={handleServiceEnvironmentsChange}
            />
          </StepperContent>

          <StepperContent value="server" className="custom-compose-step-panel">
            <div className="custom-compose-server-step">
              {serversQuery.isPending ? (
                <div className="custom-compose-server-state" aria-busy="true">
                  <p>Loading servers…</p>
                </div>
              ) : serversQuery.isError ? (
                <div className="custom-compose-server-state custom-compose-server-state-error">
                  <p>{getErrorMessage(serversQuery.error)}</p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void serversQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : servers.length === 0 ? (
                <div className="custom-compose-server-state">
                  <p className="custom-compose-server-empty-title">
                    No servers yet
                  </p>
                  <p>
                    Add a server from the Servers page before deploying.
                  </p>
                  <Link to="/servers" className="btn-primary">
                    Go to Servers
                  </Link>
                </div>
              ) : (
                  <div className="custom-compose-server-step-center form-field">
                    <p className="custom-compose-server-step-hint">
                      Select the server where this stack will run.
                    </p>
                    <div className="custom-compose-server-dropdown-wrap">
                    <Dropdown
                      id="custom-compose-server-dropdown"
                      className="custom-compose-server-dropdown"
                      label="Server"
                      value={serverId}
                      options={[
                        { value: "", label: "Select a server…" },
                        ...servers.map((server) => ({
                          value: server.id,
                          label: isServerOperationBusy(server.operationStatus)
                            ? `${server.name} (busy)`
                            : server.name,
                        })),
                      ]}
                      onChange={(value) => {
                        const selected = servers.find(
                          (server) => server.id === value,
                        );
                        if (
                          selected &&
                          isServerOperationBusy(selected.operationStatus)
                        ) {
                          setServerError(
                            "This server is busy. Choose another server.",
                          );
                          return;
                        }

                        setServerId(value);
                        setServerError(null);
                        invalidateFrom("server");
                      }}
                      disabled={isBusy}
                      searchable
                      searchPlaceholder="Search servers by name…"
                      noResultsLabel="No servers found"
                      ariaLabel="Select server"
                      pinnedOptionValue=""
                    />
                  </div>
                  {serverError ? (
                    <p className="custom-compose-field-error" role="alert">
                      {serverError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </StepperContent>

          <StepperContent value="review" className="custom-compose-step-panel">
            <div className="custom-compose-review">
              <div className="custom-compose-review-summary">
                <div className="custom-compose-review-summary-col">
                  <span className="deploy-service-target-label">
                    Deployment name
                  </span>
                  <p className="deploy-service-target-name">
                    {displayName.trim() || "—"}
                  </p>
                </div>

                <div className="custom-compose-review-summary-col custom-compose-review-summary-col-server">
                  <span className="deploy-service-target-label">Server</span>
                  <div className="custom-compose-review-server-line">
                    <span className="deploy-service-target-name">
                      {serverQuery.data?.name ?? "No server selected"}
                    </span>
                    {serverQuery.data?.username ? (
                      <>
                        <span
                          className="custom-compose-review-server-sep"
                          aria-hidden
                        >
                          ·
                        </span>
                        <span className="custom-compose-review-server-meta">
                          {serverQuery.data.username}
                        </span>
                      </>
                    ) : null}
                    {serverQuery.data?.host ? (
                      <>
                        <span
                          className="custom-compose-review-server-sep"
                          aria-hidden
                        >
                          ·
                        </span>
                        <SensitiveHost host={serverQuery.data.host} />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="custom-compose-review-compose">
                <header className="custom-compose-review-compose-header">
                  <h2>Resolved configuration</h2>
                  <p>
                    Read-only preview of the Compose file that will be deployed.
                  </p>
                </header>
                <div className="custom-compose-upload-editor-wrap custom-compose-upload-editor-fill">
                  <CustomComposeEditor
                    composeYaml={resolvedComposeYaml}
                    showEnvTab={false}
                    readOnly
                    height="100%"
                    onComposeChange={() => undefined}
                  />
                </div>
              </div>
            </div>
          </StepperContent>
        </div>

        <footer
          className={`deploy-configure-actions custom-compose-upload-actions${isFirstStep ? " is-first-step" : ""}`}
        >
          {!isFirstStep ? (
            <StepperPrev asChild>
              <button type="button" className="btn-secondary" disabled={isBusy}>
                Previous
              </button>
            </StepperPrev>
          ) : (
            <span />
          )}

          {isLastStep ? (
            <button
              type="button"
              className={`btn-primary deploy-configure-action-btn${isDeploying ? " is-loading" : ""}`}
              disabled={isBusy || !serverId}
              aria-busy={isDeploying}
              onClick={() => void handleDeploy()}
            >
              Deploy
            </button>
          ) : (
            <StepperNext asChild>
              <button
                type="button"
                className={`btn-primary deploy-configure-action-btn${isValidating ? " is-loading" : ""}`}
                disabled={isBusy}
                aria-busy={isValidating}
              >
                Continue
              </button>
            </StepperNext>
          )}
        </footer>
      </Stepper>
    </div>
  );
}
