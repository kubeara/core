/** Locales that plan translations are available in. */
export const SUPPORTED_PLAN_LOCALES = ["en", "de", "fr", "pt"] as const;

export type PlanLocale = (typeof SUPPORTED_PLAN_LOCALES)[number];
