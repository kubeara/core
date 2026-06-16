import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  getTemplateDescriptionFromComments,
  getTemplateLongDescriptionFromComments,
  parseTemplateCommentMetadata,
  parseTemplateVariables,
  TemplatePayloadService,
} from "@shared/common";
import * as yaml from "js-yaml";

import { ServiceTemplateEntity } from "../entities/service-template.entity";
import {
  PUBLIC_TEMPLATE_DETAIL_FIELDS,
  PUBLIC_TEMPLATE_LIST_FIELDS,
  TEMPLATE_LIST_FIELDS,
  type PublicTemplateDetailsDto,
  type PublicTemplateListItemDto,
  type TemplateListField,
  type TemplateListItemPick,
} from "../dto/template-list-fields";
import type {
  TemplateDetailsDto,
  TemplateListItemDto,
} from "../dto/template-marketplace.dto";

type ComposeJson = Record<string, unknown>;

interface ListTemplatesOptions {
  category?: string;
}

export type TemplateResponse =
  | {
      slug: string;
      compose: string;
    }
  | {
      slug: string;
      compose: ComposeJson;
    };

@Injectable()
export class ServiceTemplateService {
  constructor(
    @InjectRepository(ServiceTemplateEntity)
    private readonly serviceTemplateRepository: Repository<ServiceTemplateEntity>,
    private readonly templatePayloadService: TemplatePayloadService,
  ) {}

  async getTemplate(
    slug: string,
    format: string = "yml",
  ): Promise<TemplateResponse> {
    try {
      const template = await this.getTemplateEntity(slug);
      const normalizedFormat = format.toLowerCase();

      switch (normalizedFormat) {
        case "base64":
          return { slug: template.slug, compose: template.compose };

        case "json":
          return {
            slug: template.slug,
            compose: this.templatePayloadService.decodeBase64ToObject(
              template.compose,
            ),
          };

        case "yml":
        case "yaml":
          return {
            slug: template.slug,
            compose: yaml.dump(
              this.templatePayloadService.decodeBase64ToObject(
                template.compose,
              ),
              {
                lineWidth: -1,
                noRefs: true,
              },
            ),
          };

        default:
          throw new BadRequestException(
            `Unsupported format '${format}'. Supported formats: yml, yaml, json, base64.`,
          );
      }
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve template "${slug}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getTemplateEntity(slug: string): Promise<ServiceTemplateEntity> {
    try {
      const template = await this.serviceTemplateRepository.findOne({
        where: { slug },
      });

      if (!template) {
        throw new NotFoundException(`Template '${slug}' not found`);
      }

      return template;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to load template entity "${slug}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async listPublicTemplates(
    category?: string,
  ): Promise<PublicTemplateListItemDto[]> {
    return this.listTemplates(PUBLIC_TEMPLATE_LIST_FIELDS, { category });
  }

  async listUniqueCategories(): Promise<string[]> {
    const templates = await this.listTemplates(["category"]);
    const categories = new Set<string>();

    for (const template of templates) {
      for (const category of template.category) {
        const trimmed = category.trim();
        if (trimmed) {
          categories.add(trimmed);
        }
      }
    }

    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }

  async getPublicTemplateDetails(
    slug: string,
  ): Promise<PublicTemplateDetailsDto> {
    const template = await this.getTemplateDetails(slug);
    return this.pickTemplateFields(template, PUBLIC_TEMPLATE_DETAIL_FIELDS);
  }

  async listTemplates(): Promise<TemplateListItemDto[]>;
  async listTemplates<F extends TemplateListField>(
    fields: readonly F[],
    options?: ListTemplatesOptions,
  ): Promise<Array<TemplateListItemPick<F>>>;
  async listTemplates<F extends TemplateListField>(
    fields?: readonly F[],
    options?: ListTemplatesOptions,
  ): Promise<Array<TemplateListItemPick<F>> | TemplateListItemDto[]> {
    try {
      const resolvedFields = fields ?? TEMPLATE_LIST_FIELDS;
      const templates = await this.serviceTemplateRepository.find({
        where: { isActive: true },
        order: { name: "ASC" },
      });

      const items = templates.map((template) =>
        this.toTemplateListItem(template),
      );
      const filtered = this.filterTemplatesByCategory(items, options?.category);

      return filtered.map((template) =>
        this.pickTemplateFields(template, resolvedFields),
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to list templates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getTemplateDetails(slug: string): Promise<TemplateDetailsDto> {
    try {
      const template = await this.getTemplateEntity(slug);
      const composeYaml = this.getComposeYaml(template);
      const commentMetadata = parseTemplateCommentMetadata(composeYaml);

      return {
        ...this.toTemplateListItem(template, commentMetadata),
        variables: parseTemplateVariables(composeYaml),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve template details "${slug}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getComposeYaml(template: ServiceTemplateEntity): string {
    return yaml.dump(
      this.templatePayloadService.decodeBase64ToObject(template.compose),
      {
        lineWidth: -1,
        noRefs: true,
      },
    );
  }

  private filterTemplatesByCategory(
    templates: TemplateListItemDto[],
    category?: string,
  ): TemplateListItemDto[] {
    if (!category) {
      return templates;
    }

    const normalizedCategory = category.trim().toLowerCase();
    if (!normalizedCategory) {
      throw new BadRequestException("category query parameter cannot be empty");
    }

    return templates.filter((template) =>
      template.category.some(
        (value) => value.trim().toLowerCase() === normalizedCategory,
      ),
    );
  }

  private pickTemplateFields<F extends TemplateListField>(
    template: TemplateListItemDto,
    fields: readonly F[],
  ): TemplateListItemPick<F> {
    const result = {} as TemplateListItemPick<F>;

    for (const field of fields) {
      result[field] = template[field];
    }

    return result;
  }

  private toTemplateListItem(
    template: ServiceTemplateEntity,
    commentMetadata?: ReturnType<typeof parseTemplateCommentMetadata>,
  ): TemplateListItemDto {
    return {
      slug: template.slug,
      name: template.name,
      shortDescription:
        template.shortDescription?.trim() ||
        (commentMetadata
          ? getTemplateDescriptionFromComments(commentMetadata)
          : ""),
      longDescription:
        template.longDescription?.trim() ||
        (commentMetadata
          ? getTemplateLongDescriptionFromComments(commentMetadata) || null
          : null),
      category:
        template.category && template.category.length > 0
          ? template.category
          : (commentMetadata?.category ?? []),
      tags:
        template.tags && template.tags.length > 0
          ? template.tags
          : (commentMetadata?.tags ?? []),
      logo: template.logo?.trim() || null,
      port: template.port ?? commentMetadata?.port ?? 0,
    };
  }
}
