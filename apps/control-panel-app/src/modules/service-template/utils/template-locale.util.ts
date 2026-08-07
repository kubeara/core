import { BadRequestException } from "@nestjs/common";

import {
  DEFAULT_TEMPLATE_LOCALE,
  SUPPORTED_TEMPLATE_LOCALES,
  type TemplateLocale,
} from "../constants/template-list.constants";

/**
 * Normalizes and validates a template listing locale.
 * Falls back to the default locale when none is provided.
 * @param locale - Optional raw locale value from a query parameter.
 * @returns A supported lowercase locale code.
 * @throws BadRequestException when the locale is not supported.
 */
export function normalizeTemplateLocale(locale?: string): TemplateLocale {
  if (locale === undefined || locale === null || locale.trim() === "") {
    return DEFAULT_TEMPLATE_LOCALE;
  }

  const normalized = locale.trim().toLowerCase();

  if (
    !SUPPORTED_TEMPLATE_LOCALES.includes(
      normalized as (typeof SUPPORTED_TEMPLATE_LOCALES)[number],
    )
  ) {
    throw new BadRequestException(
      `Unsupported locale '${locale}'. Supported locales: ${SUPPORTED_TEMPLATE_LOCALES.join(", ")}.`,
    );
  }

  return normalized as TemplateLocale;
}
