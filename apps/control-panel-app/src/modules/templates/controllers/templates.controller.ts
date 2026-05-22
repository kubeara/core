import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { TemplatesService } from "../services/templates.service";

@Controller("templates")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get(":slug")
  async getTemplate(
    @Param("slug") slug: string,
    @Query("format") format = "yml",
    @Res() res: Response,
  ): Promise<void> {
    const normalized = (format || "yml").toLowerCase();

    const tpl = await this.templatesService.getTemplate(slug, format);

    if (normalized === "yml" || normalized === "yaml") {
      const yamlContent = (tpl as { compose: string }).compose;

      res.setHeader("Content-Type", "application/x-yaml");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${slug}.yml"`,
      );

      res.send(yamlContent);
      return;
    }

    res.json(tpl);
  }
}
