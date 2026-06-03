export interface TemplateListItemDto {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  port: number;
}

export type TemplateVariableType = "string" | "number" | "boolean";

export interface TemplateVariableDto {
  name: string;
  type: TemplateVariableType;
  required: boolean;
  defaultValue: string | number | boolean | null;
  hasRequiredOccurrence: boolean;
  hasDefaultSyntax: boolean;
}

export interface TemplateDetailsDto extends TemplateListItemDto {
  variables: TemplateVariableDto[];
}
