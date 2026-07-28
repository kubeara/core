/** Maximum allowed upload size for custom compose YAML (256 KiB). */
export const CUSTOM_COMPOSE_MAX_BYTES = 256 * 1024;

/** Slug for the seeded internal custom-compose service template. */
export const CUSTOM_TEMPLATE_SLUG = "custom";

/** Templates hidden from marketplace / service listing queries. */
export const LISTING_EXCLUDED_TEMPLATE_SLUGS = [CUSTOM_TEMPLATE_SLUG] as const;
