import { useEffect, useRef, useState } from "react";
import type { CustomComposeServiceEnvironment } from "@/features/deployments/api/custom-compose";
import { validateEnvFile } from "@/features/deployments/api/custom-compose";
import { ComposeFileDropzone } from "@/features/deployments/components/compose-upload-form";
import { CustomComposeEditor } from "@/features/deployments/components/custom-compose-editor";
import {
  applyDotEnvEditorContentToService,
  upsertDotEnvIntoService,
  serializeServiceEnvToDotEnv,
} from "@/features/deployments/utils/custom-compose-env-preview.util";
import { getErrorMessage } from "@/api/api-error";
import { TooltipHint } from "@/components/ui/tooltip";
import { showErrorToast } from "@/lib/toast";

type CustomComposeEnvConfigProps = {
  serviceEnvironments: CustomComposeServiceEnvironment[];
  /** Compose-derived defaults used when a service .env upload is removed. */
  baselineServiceEnvironments: CustomComposeServiceEnvironment[];
  disabled?: boolean;
  errorMessage?: string | null;
  issues?: Array<{ path: string; message: string }>;
  onServiceEnvironmentsChange: (
    next: CustomComposeServiceEnvironment[],
  ) => void;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`custom-compose-env-chevron${open ? " is-open" : ""}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 10.5v6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="7.25" r="1" fill="currentColor" />
    </svg>
  );
}

function formatValidationIssues(
  issues: Array<{ path: string; message: string }>,
): string {
  return issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("\n");
}

function scrollChildIntoContainer(
  container: HTMLElement,
  child: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const containerRect = container.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  const nextTop =
    childRect.top - containerRect.top + container.scrollTop - 8;

  container.scrollTo({
    top: Math.max(0, nextTop),
    behavior,
  });
}

/**
 * Per-service environment editor with optional .env upload (upsert into service env).
 * One accordion section is open at a time; all may be closed.
 */
export function CustomComposeEnvConfig({
  serviceEnvironments,
  baselineServiceEnvironments,
  disabled,
  errorMessage,
  issues,
  onServiceEnvironmentsChange,
}: CustomComposeEnvConfigProps) {
  const [activeServiceName, setActiveServiceName] = useState<string | null>(
    null,
  );
  const [envFileNameByService, setEnvFileNameByService] = useState<
    Record<string, string>
  >({});
  const [envFileError, setEnvFileError] = useState<string | null>(null);
  const [didOpenInitial, setDidOpenInitial] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const accordionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (didOpenInitial) {
      return;
    }

    const first = serviceEnvironments[0]?.serviceName;
    if (first) {
      setActiveServiceName(first);
      setDidOpenInitial(true);
    }
  }, [didOpenInitial, serviceEnvironments]);

  useEffect(() => {
    if (!activeServiceName) {
      return;
    }

    const container = scrollContainerRef.current;
    const accordion = accordionRefs.current[activeServiceName];
    if (!container || !accordion) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollChildIntoContainer(container, accordion);
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeServiceName]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const container = scrollContainerRef.current;
    const banner = errorBannerRef.current;
    if (!container) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (banner) {
          scrollChildIntoContainer(container, banner);
          return;
        }

        container.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [errorMessage, issues]);

  function updateServiceEnv(serviceName: string, env: Record<string, string>) {
    onServiceEnvironmentsChange(
      serviceEnvironments.map((service) =>
        service.serviceName === serviceName ? { ...service, env } : service,
      ),
    );
  }

  async function handleEnvFile(serviceName: string, file: File) {
    const error = validateEnvFile(file);
    if (error) {
      setEnvFileError(error);
      return;
    }

    try {
      const content = await file.text();
      const service = serviceEnvironments.find(
        (item) => item.serviceName === serviceName,
      );
      if (!service) {
        return;
      }

      setEnvFileError(null);
      setEnvFileNameByService((current) => ({
        ...current,
        [serviceName]: file.name,
      }));
      updateServiceEnv(
        serviceName,
        upsertDotEnvIntoService(service.env, content),
      );
    } catch (error) {
      showErrorToast(getErrorMessage(error));
    }
  }

  function handleClearEnvFile(serviceName: string) {
    const baseline = baselineServiceEnvironments.find(
      (service) => service.serviceName === serviceName,
    );
    if (baseline) {
      updateServiceEnv(serviceName, { ...baseline.env });
    }

    setEnvFileNameByService((current) => {
      const next = { ...current };
      delete next[serviceName];
      return next;
    });
    setEnvFileError(null);
  }

  if (serviceEnvironments.length === 0) {
    return (
      <p className="deploy-form-empty-state">
        No Compose services were detected. Go back and upload a valid compose
        file.
      </p>
    );
  }

  const issueDetails =
    issues && issues.length > 0 ? formatValidationIssues(issues) : null;

  return (
    <div
      ref={scrollContainerRef}
      className={`custom-compose-env-config${activeServiceName ? " has-open" : ""}`}
    >
      {errorMessage ? (
        <div
          ref={errorBannerRef}
          className="custom-compose-env-error-banner"
          role="alert"
        >
          <span className="custom-compose-env-error-text">{errorMessage}</span>
          {issueDetails ? (
            <TooltipHint
              content={issueDetails}
              multiline
              variant="error"
              side="bottom"
              align="start"
              contentClassName="custom-compose-env-error-tooltip"
            >
              <button
                type="button"
                className="custom-compose-env-error-info"
                aria-label="Show missing environment variables"
              >
                <InfoIcon />
              </button>
            </TooltipHint>
          ) : null}
        </div>
      ) : null}

      {serviceEnvironments.map((service) => {
        const expanded = service.serviceName === activeServiceName;
        const keys = Object.keys(service.env);
        const envFileName = envFileNameByService[service.serviceName];
        const envEditorContent = serializeServiceEnvToDotEnv(service.env);

        return (
          <section
            key={service.serviceName}
            ref={(node) => {
              accordionRefs.current[service.serviceName] = node;
            }}
            className={`custom-compose-env-accordion${expanded ? " is-open" : ""}`}
          >
            <button
              type="button"
              className="custom-compose-env-accordion-trigger"
              aria-expanded={expanded}
              disabled={disabled}
              onClick={() =>
                setActiveServiceName((current) =>
                  current === service.serviceName ? null : service.serviceName,
                )
              }
            >
              <span className="custom-compose-env-accordion-title">
                <ChevronIcon open={expanded} />
                <span>{service.serviceName}</span>
              </span>
              <span className="custom-compose-env-accordion-count">
                {keys.length} variable{keys.length === 1 ? "" : "s"}
              </span>
            </button>

            {expanded ? (
              <div className="custom-compose-env-accordion-body">
                {!envFileName ? (
                  <ComposeFileDropzone
                    accept=".env,text/plain"
                    title="Optional .env for this service"
                    subtitle="Click to upload. Matching keys are updated; new keys are added to this service."
                    error={envFileError}
                    disabled={disabled}
                    secondary
                    onFile={(file) =>
                      void handleEnvFile(service.serviceName, file)
                    }
                  />
                ) : null}

                {envFileError && !envFileName ? (
                  <p className="custom-compose-field-error" role="alert">
                    {envFileError}
                  </p>
                ) : null}

                {keys.length === 0 ? (
                  <p className="deploy-form-empty-state custom-compose-env-preview-empty">
                    No environment variables for{" "}
                    <strong>{service.serviceName}</strong>.
                  </p>
                ) : (
                  <div className="custom-compose-env-editor-wrap">
                    <CustomComposeEditor
                      composeYaml=""
                      envFileContent={envEditorContent}
                      envOnly
                      showEnvTab={false}
                      disabled={disabled}
                      height="100%"
                      fileLabel={envFileName ? `.env · ${envFileName}` : ".env"}
                      removeFileLabel={envFileName ? "Delete" : undefined}
                      onRemoveFile={
                        envFileName
                          ? () => handleClearEnvFile(service.serviceName)
                          : undefined
                      }
                      onComposeChange={() => undefined}
                      onEnvChange={(value) => {
                        updateServiceEnv(
                          service.serviceName,
                          applyDotEnvEditorContentToService(service.env, value),
                        );
                      }}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
