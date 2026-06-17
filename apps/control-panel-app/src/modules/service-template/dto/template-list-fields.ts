import type { TemplateListItemDto } from "./template-marketplace.dto";

export const TEMPLATE_LIST_FIELDS = [
  "slug",
  "name",
  "shortDescription",
  "longDescription",
  "category",
  "tags",
  "logo",
  "port",
] as const;

export type TemplateListField = (typeof TEMPLATE_LIST_FIELDS)[number];

export type TemplateListItemPick<F extends TemplateListField> = Pick<
  TemplateListItemDto,
  F
>;

export const PUBLIC_TEMPLATE_LIST_FIELDS = [
  "slug",
  "name",
  "shortDescription",
  "category",
  "logo",
] as const satisfies readonly TemplateListField[];

export const PUBLIC_TEMPLATE_DETAIL_FIELDS = [
  ...PUBLIC_TEMPLATE_LIST_FIELDS,
  "longDescription",
] as const satisfies readonly TemplateListField[];

export type PublicTemplateListItemDto = TemplateListItemPick<
  (typeof PUBLIC_TEMPLATE_LIST_FIELDS)[number]
>;

export type PublicTemplateDetailsDto = TemplateListItemPick<
  (typeof PUBLIC_TEMPLATE_DETAIL_FIELDS)[number]
>;
