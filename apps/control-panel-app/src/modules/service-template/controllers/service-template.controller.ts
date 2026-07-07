import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { PaginatedResponse } from "@shared/common";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";

import { ListTemplatesQueryDto } from "../dto/list-templates-query.dto";
import type { TemplateListItemDto } from "../dto/template-marketplace.dto";
import { ServiceTemplateService } from "../services/service-template.service";

@Controller("templates")
export class ServiceTemplateController {
  private readonly logger = new Logger(ServiceTemplateController.name);

  constructor(
    private readonly serviceTemplateService: ServiceTemplateService,
  ) {}

  /**
   * Lists templates with pagination.
   */
  @Get()
  async listTemplates(
    @Query() query: ListTemplatesQueryDto,
  ): Promise<ServiceResponse<PaginatedResponse<TemplateListItemDto>>> {
    try {
      return await this.serviceTemplateService.listTemplatesPaginated(query);
    } catch (error) {
      this.logger.error(`List templates failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Lists unique template categories.
   */
  @Get("categories")
  async listCategories(): Promise<ServiceResponse<string[]>> {
    try {
      return await this.serviceTemplateService.listTemplateCategories();
    } catch (error) {
      this.logger.error(
        `List template categories failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Gets the template by slug and format.
   */
  @Get(":slug")
  async getTemplate(
    @Param("slug") slug: string,
    @Query("format") format = "details",
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const normalized = (format || "details").toLowerCase();

      if (normalized === "details") {
        return await this.serviceTemplateService.getTemplateDetails(slug);
      }

      if (normalized === "yml" || normalized === "yaml") {
        const tpl = await this.serviceTemplateService.getTemplate(slug, format);
        res.setHeader("Content-Type", "application/x-yaml");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${slug}.yml"`,
        );
        res.send((tpl as { compose: string }).compose);
        return;
      }

      if (normalized === "json" || normalized === "base64") {
        const tpl = await this.serviceTemplateService.getTemplate(slug, format);
        res.json(tpl);
        return;
      }

      throw new BadRequestException(
        `Unsupported format '${format}'. Supported formats: details, yml, yaml, json, base64.`,
      );
    } catch (error) {
      this.logger.error(`Get template failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
