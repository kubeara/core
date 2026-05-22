import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TemplatePayloadService } from "@shared/common";

import { ServiceTemplateEntity } from "../modules/templates/entities/service-template.entity";

import * as yaml from "js-yaml";

type ComposeJson = Record<string, unknown>;

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
export class TemplatesService {
  /**
   * Creates service with template repository and payload utilities.
   * @param serviceTemplateRepository TypeORM repository for templates.
   * @param templatePayloadService Helper to decode compose payloads.
   */
  constructor(
    @InjectRepository(ServiceTemplateEntity)
    private readonly serviceTemplateRepository: Repository<ServiceTemplateEntity>,
    private readonly templatePayloadService: TemplatePayloadService,
  ) {}

  /**
   * Retrieves a template by slug and returns it in the requested format.
   * @param slug Template slug identifier.
   * @param format Response format: yml, yaml, json, or base64.
   * @returns Template payload in requested format.
   */
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

  /**
   * Retrieves a template entity from the database.
   * @param slug Template slug identifier.
   * @returns Template entity from persistence.
   */
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
}
