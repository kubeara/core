export interface TemplateVariable {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  defaultValue: string | number | boolean | null;
  hasRequiredOccurrence: boolean;
  hasDefaultSyntax: boolean;
}

export interface ApiTemplate {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  logo?: string | null;
  port: number | null;
  version?: string | null;
  variables?: TemplateVariable[];
}

export interface DeployTemplateRequest {
  serverId: string;
  templateSlug: string;
  env: Record<string, string>;
  ports?: Record<string, string>;
}

export interface DeployFormField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "port";
  required: boolean;
  defaultValue: string;
  description: string | null;
  section: "env" | "port";
}
