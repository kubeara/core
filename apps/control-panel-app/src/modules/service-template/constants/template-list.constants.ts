export const DEFAULT_TEMPLATE_LIST_PAGE = 1;
export const DEFAULT_TEMPLATE_LIST_LIMIT = 12;
export const MAX_TEMPLATE_LIST_LIMIT = 100;

/** Locales that template translations are available in. */
export const SUPPORTED_TEMPLATE_LOCALES = ["en", "de", "fr", "pt"] as const;

export type TemplateLocale = (typeof SUPPORTED_TEMPLATE_LOCALES)[number];
