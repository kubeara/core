/** Maximum allowed upload size for custom compose YAML (256 KiB). */
export const CUSTOM_COMPOSE_MAX_BYTES = 256 * 1024;

/** Maximum allowed upload size for optional custom compose .env (256 KiB). */
export const CUSTOM_ENV_MAX_BYTES = 256 * 1024;

/** Valid Docker Compose / dotenv variable name pattern. */
export const CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Slug for the seeded internal custom-compose service template. */
export const CUSTOM_TEMPLATE_SLUG = "custom";

/** Templates hidden from marketplace / service listing queries. */
export const LISTING_EXCLUDED_TEMPLATE_SLUGS = [CUSTOM_TEMPLATE_SLUG] as const;
