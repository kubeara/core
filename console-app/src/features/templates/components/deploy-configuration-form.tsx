import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { Form } from "@/components/ui/form";
import { DeployFormFieldsSkeleton } from "@/components/shared/skeleton";
import type { ApiTemplate } from "../types";
import { useTemplateDetailsQuery } from "../hooks";
import {
  buildDeployFormDefaults,
  buildDeployFormSchema,
  splitDeployFormValues,
} from "../utils/deploy-form-schema";
import { groupTemplateVariables } from "../utils/field-utils";
import { getDeploymentSocket } from "@/lib/socket/deployment-socket-client";
import { showErrorToast } from "@/lib/toast";
import { checkDeploymentPorts } from "@/features/deployments/api";
import { mapDeploymentFailureMessage } from "@/features/deployments/constants/deployment-failure-messages";
import { DynamicDeployFields } from "./dynamic-deploy-fields";
import { DeployServiceSummaryCard } from "./deploy-service-summary-card";

type DeployConfigurationFormProps = {
  template: ApiTemplate;
  serverId: string;
  serverName?: string;
};

export function DeployConfigurationForm({
  template,
  serverId,
  serverName,
}: DeployConfigurationFormProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const editSnapshotRef = useRef<Record<string, unknown>>({});
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
    setIsEditing(false);
    editSnapshotRef.current = {};
  }, [form, resolvedTemplate]);

  useEffect(() => {
    getDeploymentSocket();
  }, []);

  const isLoadingFields = detailsQuery.isPending && !detailsQuery.data;
  const { ports, required, optional } = groupTemplateVariables(variables);
  const fieldCount = ports.length + required.length + optional.length;

  function handleEdit() {
    editSnapshotRef.current = form.getValues();
    setIsEditing(true);
  }

  function handleCancelEdit() {
    form.reset(editSnapshotRef.current);
    setIsEditing(false);
  }

  async function handleSaveEdit() {
    const valid = await form.trigger();
    if (!valid) return;
    editSnapshotRef.current = form.getValues();
    setIsEditing(false);
  }

  async function handleDeploy() {
    const valid = await form.trigger();
    if (!valid) return;
    editSnapshotRef.current = form.getValues();
    form.handleSubmit(handleSubmit)();
  }

  async function handleSubmit(values: Record<string, unknown>) {
    setIsSubmitting(true);
    const { env, ports: portValues } = splitDeployFormValues(variables, values);

    try {
      await checkDeploymentPorts({
        templateSlug: template.slug,
        serverId,
        env,
        ports: portValues,
      });

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
    } catch (error) {
      showErrorToast(
        mapDeploymentFailureMessage(getErrorMessage(error)),
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="deploy-configure-layout">
      <DeployServiceSummaryCard
        template={resolvedTemplate}
        serverName={serverName}
        serverId={serverId}
        variableCount={isLoadingFields ? "loading" : fieldCount}
      />

      <div className="deploy-configure-main">
        <header className="deploy-configure-main-header">
          <div>
            <h1>Configure deployment</h1>
            <p>
              Review environment variables and ports for this template. Edit to
              change values, then save to return to read-only view before deploying.
            </p>
          </div>
          {!isLoadingFields &&
            !detailsQuery.isError &&
            variables.length > 0 &&
            !isEditing && (
              <button
                type="button"
                className="btn-secondary deploy-configure-edit-btn"
                onClick={handleEdit}
              >
                Edit
              </button>
            )}
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
                <DeployFormFieldsSkeleton />
              ) : (
                <DynamicDeployFields
                  control={form.control}
                  variables={variables}
                  isEditing={isEditing}
                />
              )}
            </div>

            <footer className="deploy-configure-actions">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary deploy-configure-action-btn"
                    onClick={handleCancelEdit}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary deploy-configure-action-btn"
                    onClick={() => void handleSaveEdit()}
                    disabled={isSubmitting}
                  >
                    Save
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`btn-primary deploy-configure-action-btn${isSubmitting ? " is-loading" : ""}`}
                  onClick={() => void handleDeploy()}
                  disabled={
                    isSubmitting || isLoadingFields || detailsQuery.isError
                  }
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? "Checking ports…" : "Deploy"}
                </button>
              )}
            </footer>
          </form>
        </Form>
      </div>
    </div>
  );
}
