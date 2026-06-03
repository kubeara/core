import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  parseTemplateCommentMetadata,
  parseTemplateVariables,
  TemplatePayloadService,
} from "@shared/common";
import * as yaml from "js-yaml";

import { ServiceTemplateEntity } from "../entities/service-template.entity";
import type {
  TemplateDetailsDto,
  TemplateListItemDto,
} from "../dto/template-marketplace.dto";

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

  async listTemplates(): Promise<TemplateListItemDto[]> {
    try {
      const templates = await this.serviceTemplateRepository.find({
        where: { isActive: true },
        order: { name: "ASC" },
      });

      return templates.map((template) => this.toTemplateListItem(template));
    } catch (error) {
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

  private toTemplateListItem(
    template: ServiceTemplateEntity,
    commentMetadata?: ReturnType<typeof parseTemplateCommentMetadata>,
  ): TemplateListItemDto {
    return {
      slug: template.slug,
      name: template.name,
      description:
        template.description?.trim() || commentMetadata?.slogan?.trim() || "",
      category:
        template.category?.trim() || commentMetadata?.category?.trim() || "",
      tags:
        template.tags && template.tags.length > 0
          ? template.tags
          : (commentMetadata?.tags ?? []),
      port: template.port ?? commentMetadata?.port ?? 0,
    };
  }
}
