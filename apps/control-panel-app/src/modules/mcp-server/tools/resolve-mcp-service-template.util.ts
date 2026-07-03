import { BadRequestException, NotFoundException } from "@nestjs/common";

import type { TemplateListItemDto } from "@control-panel/modules/service-template/dto/template-marketplace.dto";
import { ServiceTemplateService } from "@control-panel/modules/service-template/services/service-template.service";

import {
  MCP_TEMPLATE_LIST_DEFAULT_LIMIT,
  SERVICE_NAME_TO_TEMPLATE_SLUG,
} from "../constants/mcp-tools.constants";

function normalizeServiceNameKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolves a user-facing service name to a template slug.
 */
export async function resolveServiceNameToTemplateSlug(
  serviceTemplateService: ServiceTemplateService,
  serviceName: string,
): Promise<string> {
  const trimmed = serviceName.trim();
  if (!trimmed) {
    throw new BadRequestException("serviceName is required");
  }

  const normalized = normalizeServiceNameKey(trimmed);
  const aliasSlug = SERVICE_NAME_TO_TEMPLATE_SLUG[normalized];
  if (aliasSlug) {
    await serviceTemplateService.getTemplateEntity(aliasSlug);
    return aliasSlug;
  }

  try {
    const direct = await serviceTemplateService.getTemplateEntity(normalized);
    if (direct.isActive) {
      return direct.slug;
    }
  } catch (error) {
    if (!(error instanceof NotFoundException)) {
      throw error;
    }
  }

  const response = await serviceTemplateService.listTemplatesPaginated({
    page: 1,
    limit: MCP_TEMPLATE_LIST_DEFAULT_LIMIT,
    search: trimmed,
  });

  const matches = response.data.data;
  const exactSlug = matches.find(
    (template) => normalizeServiceNameKey(template.slug) === normalized,
  );
  if (exactSlug) {
    return exactSlug.slug;
  }

  const exactName = matches.filter(
    (template) => normalizeServiceNameKey(template.name) === normalized,
  );
  if (exactName.length === 1) {
    return exactName[0].slug;
  }

  if (exactName.length > 1) {
    throw new BadRequestException(
      formatAmbiguousServiceMessage(trimmed, exactName),
    );
  }

  if (matches.length === 1) {
    return matches[0].slug;
  }

  if (matches.length > 1) {
    throw new BadRequestException(
      formatAmbiguousServiceMessage(trimmed, matches),
    );
  }

  throw new NotFoundException(`Service '${trimmed}' not found`);
}

/**
 * Formats a message for an ambiguous service name.
 * @param serviceName - The service name to format the message for
 * @param matches - The templates that match the service name
 * @returns A formatted message with the suggestions
 */
function formatAmbiguousServiceMessage(
  serviceName: string,
  matches: TemplateListItemDto[],
): string {
  const suggestions = matches
    .map((template) => `${template.name} (${template.slug})`)
    .join(", ");

  return `Multiple services match '${serviceName}'. Try one of: ${suggestions}`;
}
