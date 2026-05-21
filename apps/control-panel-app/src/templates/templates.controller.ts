import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { TemplatesService } from "./templates.service";

@Controller("templates")
export class TemplatesController {
  /**
   * Creates templates controller with template retrieval service.
   * @param templatesService Service for template lookup and formatting.
   */
  constructor(private readonly templatesService: TemplatesService) {}

  /**
   * Returns template payload in requested format and handles YAML download headers.
   * @param slug Template slug.
   * @param format Output format query parameter.
   * @param res Express response object for custom output.
   * @returns Promise resolved after response is sent.
   */
  @Get(":slug")
  async getTemplate(
    @Param("slug") slug: string,
    @Query("format") format = "yml",
    @Res() res: Response,
  ): Promise<void> {
    const normalized = (format || "yml").toLowerCase();

    const templateResponse = await this.templatesService.getTemplate(
      slug,
      format,
    );

    if (normalized === "yml" || normalized === "yaml") {
      const yamlContent = (templateResponse as { compose: string }).compose;

      res.setHeader("Content-Type", "application/x-yaml");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${slug}.yml"`,
      );

      res.send(yamlContent);
      return;
    }

    res.json(templateResponse);
  }
}
