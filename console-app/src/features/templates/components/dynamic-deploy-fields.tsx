import { useState } from "react";
import type { Control, FieldValues } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { TemplateVariable } from "../types";
import {
  formatVariableHelperText,
  formatVariableLabel,
} from "../utils/format-variable-label";
import {
  groupTemplateVariables,
  isSensitiveVariable,
} from "../utils/field-utils";

type DynamicDeployFieldsProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  variables: TemplateVariable[];
};

type VariableSectionProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  title: string;
  description: string;
  variables: TemplateVariable[];
};

function VariableField<TFieldValues extends FieldValues>({
  control,
  variable,
}: {
  control: Control<TFieldValues>;
  variable: TemplateVariable;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const isSecret = isSensitiveVariable(variable.name);
  const isRequired = variable.hasRequiredOccurrence;

  return (
    <FormField
      control={control}
      name={variable.name as never}
      render={({ field }) => (
        <FormItem className="deploy-form-field-row">
          <div>
            <span className="deploy-form-field-label">
              {formatVariableLabel(variable.name)}
              <span className="deploy-form-field-key">{variable.name}</span>
              <span
                className={`deploy-form-field-badge ${isRequired ? "required" : "optional"}`}
              >
                {isRequired ? "Required" : "Optional"}
              </span>
            </span>
            <p className="deploy-form-field-hint">
              {formatVariableHelperText(
                variable.name,
                variable.hasRequiredOccurrence,
                variable.defaultValue,
              )}
            </p>
          </div>

          <FormControl>
            {variable.type === "boolean" ? (
              <div className="deploy-form-boolean-row">
                <span className="deploy-form-boolean-label">
                  {Boolean(field.value) ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              </div>
            ) : isSecret ? (
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  autoComplete="off"
                  placeholder={
                    variable.defaultValue === null
                      ? "Enter a secure value"
                      : "Leave blank to use default"
                  }
                  {...field}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.target.value)}
                />
                <button
                  type="button"
                  className="deploy-form-reveal-btn"
                  onClick={() => setShowSecret((v) => !v)}
                  tabIndex={-1}
                  aria-label={showSecret ? "Hide value" : "Show value"}
                >
                  {showSecret ? "Hide" : "Show"}
                </button>
              </div>
            ) : (
              <Input
                type={variable.type === "number" ? "number" : "text"}
                placeholder={
                  variable.defaultValue === null
                    ? isRequired
                      ? "Enter a value"
                      : "Optional — leave blank for default"
                    : String(variable.defaultValue)
                }
                {...field}
                value={field.value ?? ""}
                onChange={(event) => {
                  if (variable.type === "number") {
                    const raw = event.target.value;
                    if (raw === "") {
                      field.onChange(undefined);
                      return;
                    }
                    const parsed = Number(raw);
                    field.onChange(Number.isNaN(parsed) ? undefined : parsed);
                    return;
                  }
                  field.onChange(event.target.value);
                }}
              />
            )}
          </FormControl>

          {!isRequired && variable.defaultValue !== null && (
            <p className="deploy-form-field-default">
              Default: <code>{String(variable.defaultValue)}</code>
            </p>
          )}

          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function VariableSection<TFieldValues extends FieldValues>({
  control,
  title,
  description,
  variables,
}: VariableSectionProps<TFieldValues>) {
  if (variables.length === 0) return null;

  return (
    <section className="deploy-form-section">
      <div className="deploy-form-section-header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="deploy-form-section-body">
        {variables.map((variable) => (
          <VariableField
            key={variable.name}
            control={control}
            variable={variable}
          />
        ))}
      </div>
    </section>
  );
}

export function DynamicDeployFields<TFieldValues extends FieldValues>({
  control,
  variables,
}: DynamicDeployFieldsProps<TFieldValues>) {
  if (variables.length === 0) {
    return (
      <div className="deploy-form-empty-state">
        No configuration required for this template. Platform defaults will be
        applied automatically when you deploy.
      </div>
    );
  }

  const { ports, required, optional } = groupTemplateVariables(variables);

  return (
    <div className="deploy-form-sections">
      <VariableSection
        control={control}
        title="Port configuration"
        description="Host ports published for services in this template."
        variables={ports}
      />
      <VariableSection
        control={control}
        title="Required variables"
        description="These must be set before deployment can proceed."
        variables={required}
      />
      <VariableSection
        control={control}
        title="Optional variables"
        description="Override defaults only when you need custom values."
        variables={optional}
      />
    </div>
  );
}
