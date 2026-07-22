import {
  Controller,
  Get,
  Header,
  Logger,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import { KubearaPublicOriginGuard } from "@control-panel/common/guards/kubeara-public-origin.guard";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import type {
  PublicTemplateDetailsDto,
  PublicTemplateListItemDto,
} from "@control-panel/modules/service-template/dto/template-list-fields";
import { ServiceTemplateService } from "@control-panel/modules/service-template/services/service-template.service";

@UseGuards(KubearaPublicOriginGuard)
@Controller("public/templates")
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name);

  constructor(
    private readonly serviceTemplateService: ServiceTemplateService,
  ) {}

  /**
   * Marketing-safe template catalog for the public landing page.
   */
  @Get()
  @Header("Cache-Control", "public, max-age=300")
  async listTemplates(
    @Query("category") category?: string,
    @Query("search") search?: string,
  ): Promise<PublicTemplateListItemDto[]> {
    try {
      return await this.serviceTemplateService.listPublicTemplates(
        category,
        search,
      );
    } catch (error) {
      this.logger.error(
        `List public templates failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * List of unique template categories.
   */
  @Get("categories")
  @Header("Cache-Control", "public, max-age=300")
  async listCategories(): Promise<string[]> {
    try {
      return await this.serviceTemplateService.listUniqueCategories();
    } catch (error) {
      this.logger.error(
        `List public template categories failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Marketing-safe template detail (no compose or deployment variables).
   */
  @Get(":slug")
  @Header("Cache-Control", "public, max-age=300")
  async getTemplate(
    @Param("slug") slug: string,
  ): Promise<PublicTemplateDetailsDto> {
    try {
      return await this.serviceTemplateService.getPublicTemplateDetails(slug);
    } catch (error) {
      this.logger.error(`Get public template failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
