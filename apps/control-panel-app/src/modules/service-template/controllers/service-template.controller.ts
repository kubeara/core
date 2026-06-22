import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { PaginatedResponse } from "@shared/common";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";

import { ListTemplatesQueryDto } from "../dto/list-templates-query.dto";
import type { TemplateListItemDto } from "../dto/template-marketplace.dto";
import { ServiceTemplateService } from "../services/service-template.service";

@Controller("templates")
export class ServiceTemplateController {
  constructor(
    private readonly serviceTemplateService: ServiceTemplateService,
  ) {}

  /**
   * Lists templates with pagination.
   */
  @Get()
  listTemplates(
    @Query() query: ListTemplatesQueryDto,
  ): Promise<ServiceResponse<PaginatedResponse<TemplateListItemDto>>> {
    return this.serviceTemplateService.listTemplatesPaginated(query);
  }

  /**
   * Lists unique template categories.
   */
  @Get("categories")
  listCategories(): Promise<ServiceResponse<string[]>> {
    return this.serviceTemplateService.listTemplateCategories();
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
    const normalized = (format || "details").toLowerCase();

    if (normalized === "details") {
      return this.serviceTemplateService.getTemplateDetails(slug);
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
  }
}
