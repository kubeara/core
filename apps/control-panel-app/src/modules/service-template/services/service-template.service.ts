import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  ArrayContains,
  ArrayOverlap,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ILike,
  Repository,
} from "typeorm";
import {
  getTemplateDescriptionFromComments,
  getTemplateLongDescriptionFromComments,
  parseTemplateCommentMetadata,
  parseTemplateVariables,
  TemplatePayloadService,
} from "@shared/common";
import * as yaml from "js-yaml";

import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { PaginatedResponse } from "@shared/common";

import { ServiceTemplateEntity } from "../entities/service-template.entity";
import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  DEFAULT_TEMPLATE_LIST_PAGE,
} from "../constants/template-list.constants";
import { ListTemplatesQueryDto } from "../dto/list-templates-query.dto";
import type {
  PublicTemplateDetailsDto,
  PublicTemplateListItemDto,
} from "../dto/template-list-fields";
import type {
  TemplateDetailsDto,
  TemplateListItemDto,
} from "../dto/template-marketplace.dto";

@Injectable()
export class ServiceTemplateService {
  constructor(
    @InjectRepository(ServiceTemplateEntity)
    private readonly serviceTemplateRepository: Repository<ServiceTemplateEntity>,
    private readonly templatePayloadService: TemplatePayloadService,
  ) {}

  /**
   * Finds a single template record using TypeORM find options.
   * @param options - TypeORM find-one options (where, relations, etc.).
   * @returns The matching template entity, or null if not found.
   */
  private async findOne(options: FindOneOptions<ServiceTemplateEntity>) {
    try {
      return await this.serviceTemplateRepository.findOne(options);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to find template: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Finds multiple template records using TypeORM find options.
   * @param options - TypeORM find-many options (where, order, select, etc.).
   * @returns Matching template entities.
   */
  private async findMany(options: FindManyOptions<ServiceTemplateEntity>) {
    try {
      return await this.serviceTemplateRepository.find(options);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to find templates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Builds TypeORM where clauses for listing active templates.
   * Applies optional category and search filters at the database level.
   * @param category - Optional category slug to filter by.
   * @param search - Optional search term matched against name, slug, description, and tags.
   * @returns A single where clause or an array of OR conditions for search.
   */
  private buildActiveListWhere(
    category?: string,
    search?: string,
  ):
    | FindOptionsWhere<ServiceTemplateEntity>
    | FindOptionsWhere<ServiceTemplateEntity>[] {
    if (category !== undefined && category.trim() === "") {
      throw new BadRequestException("category query parameter cannot be empty");
    }

    const baseWhere: FindOptionsWhere<ServiceTemplateEntity> = {
      isActive: true,
    };

    if (category?.trim()) {
      baseWhere.category = ArrayContains([category.trim().toLowerCase()]);
    }

    if (!search?.trim()) {
      return baseWhere;
    }

    const searchTerm = search.trim();
    const searchPattern = ILike(`%${searchTerm}%`);

    return [
      { ...baseWhere, name: searchPattern },
      { ...baseWhere, slug: searchPattern },
      { ...baseWhere, shortDescription: searchPattern },
      { ...baseWhere, tags: ArrayOverlap([searchTerm]) },
    ];
  }

  /**
   * Gets a template compose payload in the requested format.
   * @param slug - Template slug identifier.
   * @param format - Output format: yml, yaml, json, or base64.
   * @returns Template slug and compose content in the requested format.
   */
  async getTemplate(slug: string, format: string = "yml") {
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
              { lineWidth: -1, noRefs: true },
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

  /**
   * Loads a template entity by slug.
   * @param slug - Template slug identifier.
   * @returns The template entity.
   * @throws NotFoundException when no template exists for the slug.
   */
  async getTemplateEntity(slug: string): Promise<ServiceTemplateEntity> {
    try {
      const template = await this.findOne({ where: { slug } });

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

  /**
   * Lists marketing-safe templates for the public catalog.
   * Supports optional category and search filters applied in the database query.
   * @param category - Optional category slug to filter by.
   * @param search - Optional search term matched against name, slug, description, and tags.
   * @returns Public template list items without compose or deployment details.
   */
  async listPublicTemplates(
    category?: string,
    search?: string,
  ): Promise<PublicTemplateListItemDto[]> {
    try {
      const templates = await this.findMany({
        where: this.buildActiveListWhere(category, search),
        order: { name: "ASC" },
      });

      return templates.map((template) => {
        const item = this.toTemplateListItem(template);
        return {
          slug: item.slug,
          name: item.name,
          shortDescription: item.shortDescription,
          category: item.category,
          logo: item.logo,
        };
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to list public templates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Lists active templates with pagination, search, and category filtering.
   * @param query - Pagination, search, and category query parameters.
   * @returns A paginated service response of full template list items.
   */
  async listTemplatesPaginated(
    query: ListTemplatesQueryDto,
  ): Promise<ServiceResponse<PaginatedResponse<TemplateListItemDto>>> {
    const page = query.page ?? DEFAULT_TEMPLATE_LIST_PAGE;
    const limit = query.limit ?? DEFAULT_TEMPLATE_LIST_LIMIT;
    const skip = (page - 1) * limit;

    try {
      const [templates, total] =
        await this.serviceTemplateRepository.findAndCount({
          where: this.buildActiveListWhere(query.category, query.search),
          order: { name: "ASC" },
          skip,
          take: limit,
        });

      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

      return {
        message: SUCCESS_MESSAGES.TEMPLATE.LIST,
        data: {
          data: templates.map((template) => this.toTemplateListItem(template)),
          pagination: { page, limit, total, totalPages },
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to list templates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Lists unique template categories wrapped in a service response.
   * @returns A service response containing sorted unique category names.
   */
  async listTemplateCategories(): Promise<ServiceResponse<string[]>> {
    try {
      return {
        message: SUCCESS_MESSAGES.TEMPLATE.CATEGORIES,
        data: await this.listUniqueCategories(),
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to list template categories: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Collects unique category names from all active templates.
   * @returns Sorted list of distinct category names.
   */
  async listUniqueCategories(): Promise<string[]> {
    try {
      const templates = await this.findMany({
        where: { isActive: true },
        select: { category: true },
      });

      const categories = new Set<string>();

      for (const template of templates) {
        for (const value of template.category ?? []) {
          const trimmed = value.trim();
          if (trimmed) {
            categories.add(trimmed);
          }
        }
      }

      return Array.from(categories).sort((a, b) => a.localeCompare(b));
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to list unique categories: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Gets marketing-safe template details for the public catalog.
   * Excludes compose content and deployment variables.
   * @param slug - Template slug identifier.
   * @returns Public template details.
   */
  async getPublicTemplateDetails(
    slug: string,
  ): Promise<PublicTemplateDetailsDto> {
    try {
      const template = await this.getTemplateDetails(slug);
      return {
        slug: template.slug,
        name: template.name,
        shortDescription: template.shortDescription,
        category: template.category,
        logo: template.logo,
        longDescription: template.longDescription,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve public template "${slug}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Gets full template details including parsed deployment variables.
   * @param slug - Template slug identifier.
   * @returns Template metadata and compose variables.
   */
  async getTemplateDetails(slug: string): Promise<TemplateDetailsDto> {
    try {
      const template = await this.getTemplateEntity(slug);
      const composeYaml = yaml.dump(
        this.templatePayloadService.decodeBase64ToObject(template.compose),
        { lineWidth: -1, noRefs: true },
      );
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

  /**
   * Maps a template entity to a list item DTO.
   * Falls back to compose comment metadata when database fields are empty.
   * @param template - Template entity from the database.
   * @param commentMetadata - Optional metadata parsed from compose YAML comments.
   * @returns Normalized template list item.
   */
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
