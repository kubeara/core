import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  ArrayContains,
  And,
  ArrayOverlap,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ILike,
  In,
  Not,
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
import { ServiceTemplateTranslationEntity } from "../entities/service-template-translation.entity";
import {
  DEFAULT_TEMPLATE_LOCALE,
  DEFAULT_TEMPLATE_LIST_LIMIT,
  DEFAULT_TEMPLATE_LIST_PAGE,
} from "../constants/template-list.constants";
import { normalizeTemplateLocale } from "../utils/template-locale.util";
import { LISTING_EXCLUDED_TEMPLATE_SLUGS } from "@control-panel/modules/deployments/constants/custom-compose.constants";
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
    @InjectRepository(ServiceTemplateTranslationEntity)
    private readonly serviceTemplateTranslationRepository: Repository<ServiceTemplateTranslationEntity>,
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
   * Shared filters for active marketplace templates (excludes inactive and internal slugs).
   * @param category - Optional category slug to filter translated categories by.
   * @returns Base where filters for active marketplace templates.
   */
  private buildActiveListBaseWhere(
    category?: string,
  ): FindOptionsWhere<ServiceTemplateEntity> {
    if (category !== undefined && category.trim() === "") {
      throw new BadRequestException("category query parameter cannot be empty");
    }

    const baseWhere: FindOptionsWhere<ServiceTemplateEntity> = {
      isActive: true,
      slug: Not(In([...LISTING_EXCLUDED_TEMPLATE_SLUGS])),
    };

    const categoryTranslationWhere =
      this.buildActiveListTranslationWhere(category);

    if (categoryTranslationWhere) {
      baseWhere.translations = categoryTranslationWhere;
    }

    return baseWhere;
  }

  /**
   * Builds requested-locale translation conditions for a category filter.
   * @param category - Optional category slug to filter by.
   * @param locale - Locale code for the translated category values.
   * @returns Translation where conditions, or undefined when no category filter applies.
   */
  private buildActiveListTranslationWhere(
    category?: string,
    locale: string = DEFAULT_TEMPLATE_LOCALE,
  ): FindOptionsWhere<ServiceTemplateTranslationEntity> | undefined {
    if (category === undefined || category.trim() === "") {
      return undefined;
    }

    return {
      locale,
      category: ArrayContains([category.trim().toLowerCase()]),
    };
  }

  /**
   * Runs one search priority tier via TypeORM find (name, slug, descriptions, then tags).
   * Translation-driven tiers are merged with any category translation filter.
   * @param baseWhere - Base where filters for active marketplace templates.
   * @param categoryTranslationWhere - Optional category translation conditions.
   * @param tierTranslations - Optional translation conditions for the current search tier.
   * @param tierWhere - Optional template conditions for the current search tier.
   * @param excludedSlugs - Slugs already collected by higher-priority tiers.
   * @returns Templates matching the current search tier.
   */
  private async findActiveListSearchTier(
    baseWhere: FindOptionsWhere<ServiceTemplateEntity>,
    categoryTranslationWhere:
      FindOptionsWhere<ServiceTemplateTranslationEntity> | undefined,
    tierTranslations:
      FindOptionsWhere<ServiceTemplateTranslationEntity> | undefined,
    tierWhere: FindOptionsWhere<ServiceTemplateEntity> | undefined,
    excludedSlugs: string[],
    locale: string = DEFAULT_TEMPLATE_LOCALE,
  ): Promise<ServiceTemplateEntity[]> {
    const slugFilter =
      tierWhere?.slug !== undefined
        ? tierWhere.slug
        : Not(In([...LISTING_EXCLUDED_TEMPLATE_SLUGS, ...excludedSlugs]));

    const translations = {
      locale,
      ...(categoryTranslationWhere ?? {}),
      ...(tierTranslations ?? {}),
    };

    const hasTranslationFilter = Object.keys(translations).length > 0;

    return this.findMany({
      where: {
        ...baseWhere,
        ...(tierWhere ?? {}),
        slug: slugFilter,
        ...(hasTranslationFilter ? { translations } : {}),
      },
      order: { name: "ASC" },
    });
  }

  /**
   * Loads templates using separate TypeORM queries per search field, merged in priority order.
   * @param category - Optional category slug to filter by.
   * @param search - Optional search term matched against name, slug, description, and tags.
   * @param locale - Locale code for translated fields (description and tags).
   * @returns Matching active templates in priority order.
   */
  private async findActiveListTemplates(
    category?: string,
    search?: string,
    locale: string = DEFAULT_TEMPLATE_LOCALE,
  ): Promise<ServiceTemplateEntity[]> {
    const baseWhere = this.buildActiveListBaseWhere(category);
    const categoryTranslationWhere = this.buildActiveListTranslationWhere(
      category,
      locale,
    );
    const searchTerm = search?.trim();

    if (!searchTerm) {
      return this.findMany({
        where: baseWhere,
        order: { name: "ASC" },
      });
    }

    const searchPattern = ILike(`%${searchTerm}%`);
    const ordered: ServiceTemplateEntity[] = [];
    const collectedSlugs: string[] = [];

    const appendTier = async (
      tierTranslations?: FindOptionsWhere<ServiceTemplateTranslationEntity>,
      tierWhere?: FindOptionsWhere<ServiceTemplateEntity>,
    ) => {
      const tierMatches = await this.findActiveListSearchTier(
        baseWhere,
        categoryTranslationWhere,
        tierTranslations,
        tierWhere,
        collectedSlugs,
        locale,
      );

      for (const template of tierMatches) {
        if (collectedSlugs.includes(template.slug)) {
          continue;
        }

        collectedSlugs.push(template.slug);
        ordered.push(template);
      }
    };

    await appendTier(undefined, { name: searchPattern });
    await appendTier(undefined, {
      slug: And(
        Not(In([...LISTING_EXCLUDED_TEMPLATE_SLUGS, ...collectedSlugs])),
        searchPattern,
      ),
    });
    await appendTier({ shortDescription: searchPattern });
    await appendTier({ longDescription: searchPattern });
    await appendTier({ tags: ArrayOverlap([searchTerm]) });

    return ordered;
  }

  /**
   * Loads translations in the requested locale for the given templates.
   * @param serviceTemplateIds - Template ids to load translations for.
   * @param locale - Locale code to load translations in.
   * @returns Map of template id to its translation in the requested locale.
   */
  private async loadTranslations(
    serviceTemplateIds: string[],
    locale: string = DEFAULT_TEMPLATE_LOCALE,
  ): Promise<Map<string, ServiceTemplateTranslationEntity>> {
    if (serviceTemplateIds.length === 0) {
      return new Map();
    }

    try {
      const translations = await this.serviceTemplateTranslationRepository.find(
        {
          where: {
            locale,
            serviceTemplateId: In(serviceTemplateIds),
          },
        },
      );

      return new Map(
        translations.map((translation) => [
          translation.serviceTemplateId,
          translation,
        ]),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to load template translations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private assertTemplateIsListable(slug: string): void {
    if (
      LISTING_EXCLUDED_TEMPLATE_SLUGS.includes(
        slug as (typeof LISTING_EXCLUDED_TEMPLATE_SLUGS)[number],
      )
    ) {
      throw new NotFoundException(`Template '${slug}' not found`);
    }
  }

  /**
   * Gets a template compose payload in the requested format.
   * @param slug - Template slug identifier.
   * @param format - Output format: yml, yaml, json, or base64.
   * @returns Template slug and compose content in the requested format.
   */
  async getTemplate(slug: string, format: string = "yml") {
    try {
      this.assertTemplateIsListable(slug);
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
   *   Name matches are listed before slug, description, and tag matches.
   * @returns Public template list items without compose or deployment details.
   */
  async listPublicTemplates(
    category?: string,
    search?: string,
    locale?: string,
  ): Promise<PublicTemplateListItemDto[]> {
    const resolvedLocale = normalizeTemplateLocale(locale);
    try {
      const templates = await this.findActiveListTemplates(
        category,
        search,
        resolvedLocale,
      );
      const translations = await this.loadTranslations(
        templates.map((template) => template.id),
        resolvedLocale,
      );

      return templates.map((template) => {
        const item = this.toTemplateListItem(
          template,
          translations.get(template.id),
        );
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
    const resolvedLocale = normalizeTemplateLocale(query.locale);

    try {
      const trimmedSearch = query.search?.trim();
      let templates: ServiceTemplateEntity[];
      let total: number;

      if (trimmedSearch) {
        const allMatching = await this.findActiveListTemplates(
          query.category,
          query.search,
          resolvedLocale,
        );
        total = allMatching.length;
        templates = allMatching.slice(skip, skip + limit);
      } else {
        [templates, total] = await this.serviceTemplateRepository.findAndCount({
          where: this.buildActiveListBaseWhere(query.category),
          order: { name: "ASC" },
          skip,
          take: limit,
        });
      }

      const translations = await this.loadTranslations(
        templates.map((template) => template.id),
        resolvedLocale,
      );

      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

      return {
        message: SUCCESS_MESSAGES.TEMPLATE.LIST,
        data: {
          data: templates.map((template) =>
            this.toTemplateListItem(template, translations.get(template.id)),
          ),
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
  async listTemplateCategories(
    locale?: string,
  ): Promise<ServiceResponse<string[]>> {
    const resolvedLocale = normalizeTemplateLocale(locale);
    try {
      return {
        message: SUCCESS_MESSAGES.TEMPLATE.CATEGORIES,
        data: await this.listUniqueCategories(resolvedLocale),
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to list template categories: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Collects unique category names from all active templates.
   * @param locale - Locale code for the translated category values.
   * @returns Sorted list of distinct category names.
   */
  async listUniqueCategories(
    locale: string = DEFAULT_TEMPLATE_LOCALE,
  ): Promise<string[]> {
    try {
      const templates = await this.findMany({
        where: {
          isActive: true,
          slug: Not(In([...LISTING_EXCLUDED_TEMPLATE_SLUGS])),
        },
        select: { id: true },
      });

      const translations = await this.loadTranslations(
        templates.map((template) => template.id),
        locale,
      );

      const categories = new Set<string>();

      for (const translation of translations.values()) {
        for (const value of translation.category ?? []) {
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
    locale?: string,
  ): Promise<PublicTemplateDetailsDto> {
    const resolvedLocale = normalizeTemplateLocale(locale);
    try {
      this.assertTemplateIsListable(slug);
      const template = await this.getTemplateDetails(slug, resolvedLocale);
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
   * @param locale - Locale code for the translated fields.
   * @returns Template metadata and compose variables.
   */
  async getTemplateDetails(
    slug: string,
    locale: string = DEFAULT_TEMPLATE_LOCALE,
  ): Promise<TemplateDetailsDto> {
    try {
      this.assertTemplateIsListable(slug);
      const template = await this.getTemplateEntity(slug);
      const translation = (
        await this.loadTranslations([template.id], locale)
      ).get(template.id);
      const composeYaml = yaml.dump(
        this.templatePayloadService.decodeBase64ToObject(template.compose),
        { lineWidth: -1, noRefs: true },
      );
      const commentMetadata = parseTemplateCommentMetadata(composeYaml);

      return {
        ...this.toTemplateListItem(template, translation, commentMetadata),
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
   * Maps a template entity and its requested-locale translation to a list item DTO.
   * Falls back to compose comment metadata when translation fields are empty.
   * @param template - Template entity from the database.
   * @param translation - Optional translation for the template in the requested locale.
   * @param commentMetadata - Optional metadata parsed from compose YAML comments.
   * @returns Normalized template list item.
   */
  private toTemplateListItem(
    template: ServiceTemplateEntity,
    translation?: ServiceTemplateTranslationEntity,
    commentMetadata?: ReturnType<typeof parseTemplateCommentMetadata>,
  ): TemplateListItemDto {
    return {
      slug: template.slug,
      name: template.name,
      shortDescription:
        translation?.shortDescription?.trim() ||
        (commentMetadata
          ? getTemplateDescriptionFromComments(commentMetadata)
          : ""),
      longDescription:
        translation?.longDescription?.trim() ||
        (commentMetadata
          ? getTemplateLongDescriptionFromComments(commentMetadata) || null
          : null),
      category:
        translation?.category && translation.category.length > 0
          ? translation.category
          : (commentMetadata?.category ?? []),
      tags:
        translation?.tags && translation.tags.length > 0
          ? translation.tags
          : (commentMetadata?.tags ?? []),
      logo: template.logo?.trim() || null,
      port: template.port ?? commentMetadata?.port ?? 0,
    };
  }
}
