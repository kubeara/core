import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { Form } from "@/components/ui/form";
import type { ApiTemplate } from "../types";
import { useTemplateDetailsQuery } from "../hooks";
import {
  buildDeployFormDefaults,
  buildDeployFormSchema,
  splitDeployFormValues,
} from "../utils/deploy-form-schema";
import { groupTemplateVariables } from "../utils/field-utils";
import { getDeploymentSocket } from "@/lib/socket/deployment-socket-client";
import { DynamicDeployFields } from "./dynamic-deploy-fields";

type DeployConfigurationFormProps = {
  template: ApiTemplate;
  serverId: string;
  serverName?: string;
  cancelHref: string;
};

export function DeployConfigurationForm({
  template,
  serverId,
  serverName,
  cancelHref,
}: DeployConfigurationFormProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const detailsQuery = useTemplateDetailsQuery(template.slug);
  const resolvedTemplate = detailsQuery.data ?? template;
  const variables = resolvedTemplate.variables ?? [];

  const schema = useMemo(
    () => buildDeployFormSchema(resolvedTemplate),
    [resolvedTemplate],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: buildDeployFormDefaults(resolvedTemplate),
    mode: "onSubmit",
  });

  useEffect(() => {
    form.reset(buildDeployFormDefaults(resolvedTemplate));
  }, [form, resolvedTemplate]);

  // Pre-connect socket so the logs page receives streams immediately after deploy.
  useEffect(() => {
    getDeploymentSocket();
  }, []);

  // const accent = getTemplateAccentColor(template.slug);
  const isLoadingFields = detailsQuery.isPending && !detailsQuery.data;
  const { ports, required, optional } = groupTemplateVariables(variables);
  const fieldCount = ports.length + required.length + optional.length;

  function handleSubmit(values: Record<string, unknown>) {
    setIsSubmitting(true);
    const { env, ports: portValues } = splitDeployFormValues(variables, values);

    navigate(`/servers/${serverId}/deploy/${template.slug}/logs`, {
      state: {
        deployRequest: {
          serverId,
          templateSlug: template.slug,
          env,
          ports: portValues,
        },
      },
    });
  }

  return (
    <div
      className="deploy-configure-layout"
      // style={{ "--deploy-accent": accent } as CSSProperties}
    >
      <aside className="deploy-configure-sidebar">
        <div className="deploy-configure-sidebar-card">
          <div
            className="deploy-configure-template-icon"
            style={{
              // backgroundColor: `${accent}18`,
              // color: accent,
            }}
            aria-hidden
          >
            {template.name.charAt(0)}
          </div>
          <h2 className="deploy-configure-template-name">{template.name}</h2>
          {template.category && (
            <p className="deploy-configure-template-category">{template.category}</p>
          )}
          {template.description && (
            <p className="deploy-configure-template-desc">{template.description}</p>
          )}
          <dl className="deploy-configure-summary">
            <div>
              <dt>Target server</dt>
              <dd>{serverName ?? serverId}</dd>
            </div>
            <div>
              <dt>Template</dt>
              <dd>
                <code>{template.slug}</code>
              </dd>
            </div>
            <div>
              <dt>Variables</dt>
              <dd>
                {isLoadingFields
                  ? "Loading…"
                  : `${fieldCount} configurable field${fieldCount === 1 ? "" : "s"}`}
              </dd>
            </div>
          </dl>
        </div>
      </aside>

      <div className="deploy-configure-main">
        <header className="deploy-configure-main-header">
          <h1>Configure deployment</h1>
          <p>
            Set environment variables and ports for this template. Required fields
            must be filled before deployment starts.
          </p>
        </header>

        <Form {...form}>
          <form
            className="deploy-configure-form"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className="deploy-configure-form-content">
              {detailsQuery.isError ? (
                <p className="deploy-form-error" role="alert">
                  {getErrorMessage(detailsQuery.error)}
                </p>
              ) : null}

              {isLoadingFields ? (
                <div className="deploy-form-loading" aria-live="polite">
                  Loading template configuration…
                  <div className="deploy-form-loading-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ) : (
                <DynamicDeployFields
                  control={form.control}
                  variables={variables}
                />
              )}
            </div>

            <footer className="deploy-configure-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(cancelHref)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn-primary deploy-configure-submit${isSubmitting ? " is-loading" : ""}`}
                // style={{ backgroundColor: accent, borderColor: accent }}
                disabled={
                  isSubmitting || isLoadingFields || detailsQuery.isError
                }
              >
                {isSubmitting ? "Deploying…" : "Deploy"}
              </button>
            </footer>
          </form>
        </Form>
      </div>
    </div>
  );
}
