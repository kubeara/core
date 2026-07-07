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
  shortDescription: string | null;
  longDescription?: string | null;
  category: string[] | null;
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
  acknowledgeResourceWarning?: boolean;
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

export type TemplatesListParams = {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
};

export type PaginatedTemplatesResponse = {
  data: ApiTemplate[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
