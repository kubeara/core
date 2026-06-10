export interface TemplateListItemDto {
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string | null;
  category: string[];
  tags: string[];
  logo: string | null;
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
