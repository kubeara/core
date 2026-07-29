import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { DeployVariableList } from "@/features/templates/components/dynamic-deploy-fields";
import type { TemplateVariable } from "@/features/templates/types";
import { isPortVariable } from "@/features/templates/utils/field-utils";
import type { CustomComposeServiceEnvironment } from "../api/custom-compose";
import { enrichServiceEnvironmentsFromEditor } from "../utils/custom-compose-env-preview.util";

type CustomComposeEnvPreviewProps = {
  serviceEnvironments: CustomComposeServiceEnvironment[];
  composeYaml: string;
  envFileContent: string;
};

function inferPreviewVariableType(
  name: string,
  value: string,
): TemplateVariable["type"] {
  if (value === "true" || value === "false") {
    return "boolean";
  }

  if (isPortVariable(name) || /^-?\d+$/u.test(value)) {
    return "number";
  }

  return "string";
}

function buildPreviewVariables(env: Record<string, string>): TemplateVariable[] {
  return Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({
      name,
      type: inferPreviewVariableType(name, value),
      required: false,
      defaultValue: value,
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    }));
}

function ServiceEnvPreview({
  serviceName,
  env,
}: {
  serviceName: string;
  env: Record<string, string>;
}) {
  const fieldKeyPrefix = `${serviceName}::`;
  const variables = useMemo(() => buildPreviewVariables(env), [env]);
  const formDefaults = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(env).map(([key, value]) => [
          `${fieldKeyPrefix}${key}`,
          value,
        ]),
      ),
    [env, fieldKeyPrefix],
  );
  const form = useForm<Record<string, string>>({
    defaultValues: formDefaults,
  });

  useEffect(() => {
    form.reset(formDefaults);
  }, [formDefaults, form]);

  if (variables.length === 0) {
    return (
      <p className="deploy-form-empty-state custom-compose-env-preview-empty">
        No environment variables for <strong>{serviceName}</strong>.
      </p>
    );
  }

  return (
    <>
      <div className="custom-compose-env-preview-service-label">{serviceName}</div>
      <Form {...form}>
        <DeployVariableList
          control={form.control}
          variables={variables}
          isEditing={false}
          isRequired={false}
          fieldKeyPrefix={fieldKeyPrefix}
        />
      </Form>
    </>
  );
}

/**
 * Shows resolved environment variables grouped by compose service.
 */
export function CustomComposeEnvPreview({
  serviceEnvironments,
  composeYaml,
  envFileContent,
}: CustomComposeEnvPreviewProps) {
  const enrichedServiceEnvironments = useMemo(
    () =>
      enrichServiceEnvironmentsFromEditor(
        serviceEnvironments,
        composeYaml,
        envFileContent,
      ),
    [serviceEnvironments, composeYaml, envFileContent],
  );

  if (enrichedServiceEnvironments.length === 0) {
    return (
      <p className="deploy-form-empty-state">
        No environment variables were resolved for the configured services.
      </p>
    );
  }

  return (
    <>
      {enrichedServiceEnvironments.map((service) => (
        <ServiceEnvPreview
          key={service.serviceName}
          serviceName={service.serviceName}
          env={service.env}
        />
      ))}
    </>
  );
}
