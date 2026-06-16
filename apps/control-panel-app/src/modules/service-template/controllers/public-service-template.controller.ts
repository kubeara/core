import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import { KubearaPublicOriginGuard } from "@control-panel/common/guards/kubeara-public-origin.guard";

import type {
  PublicTemplateDetailsDto,
  PublicTemplateListItemDto,
} from "../dto/template-list-fields";
import { ServiceTemplateService } from "../services/service-template.service";

@UseGuards(KubearaPublicOriginGuard)
@Controller("public/templates")
export class PublicServiceTemplateController {
  constructor(
    private readonly serviceTemplateService: ServiceTemplateService,
  ) {}

  /**
   * Marketing-safe template catalog for the public landing page.
   */
  @Get()
  @Header("Cache-Control", "public, max-age=300")
  listTemplates(
    @Query("category") category?: string,
  ): Promise<PublicTemplateListItemDto[]> {
    return this.serviceTemplateService.listPublicTemplates(category);
  }

  @Get("categories")
  @Header("Cache-Control", "public, max-age=300")
  listCategories(): Promise<string[]> {
    return this.serviceTemplateService.listUniqueCategories();
  }

  /**
   * Marketing-safe template detail (no compose or deployment variables).
   */
  @Get(":slug")
  @Header("Cache-Control", "public, max-age=300")
  getTemplate(@Param("slug") slug: string): Promise<PublicTemplateDetailsDto> {
    return this.serviceTemplateService.getPublicTemplateDetails(slug);
  }
}
