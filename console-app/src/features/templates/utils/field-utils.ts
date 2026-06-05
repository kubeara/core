import type { TemplateVariable } from "../types";

export function isPortVariable(name: string): boolean {
  return name.toUpperCase().startsWith("SERVICE_PORT_");
}

/** Matches the "Required variables" section in the deploy configuration UI. */
export function isFormRequiredVariable(variable: TemplateVariable): boolean {
  return isPortVariable(variable.name) || variable.hasRequiredOccurrence;
}

export function isSensitiveVariable(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    upper.includes("PASSWORD") ||
    upper.includes("SECRET") ||
    upper.includes("TOKEN") ||
    upper.includes("CREDENTIAL") ||
    upper.endsWith("_KEY") ||
    upper.includes("API_KEY")
  );
}

export function groupTemplateVariables(variables: TemplateVariable[]): {
  ports: TemplateVariable[];
  required: TemplateVariable[];
  optional: TemplateVariable[];
} {
  const ports: TemplateVariable[] = [];
  const required: TemplateVariable[] = [];
  const optional: TemplateVariable[] = [];

  for (const variable of variables) {
    if (isPortVariable(variable.name)) {
      ports.push(variable);
      continue;
    }
    if (variable.hasRequiredOccurrence) {
      required.push(variable);
    } else {
      optional.push(variable);
    }
  }

  const byName = (a: TemplateVariable, b: TemplateVariable) =>
    a.name.localeCompare(b.name);

  ports.sort(byName);
  required.sort(byName);
  optional.sort(byName);

  return { ports, required, optional };
}
