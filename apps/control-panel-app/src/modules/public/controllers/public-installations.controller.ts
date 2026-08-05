import { Body, Controller, Logger, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

import { RecordInstallationEventDto } from "../dto/record-installation-event.dto";
import { SelfHostInstallationService } from "../services/self-host-installation.service";

@Controller("public/installations")
export class InstallationsController {
  private readonly logger = new Logger(InstallationsController.name);

  constructor(
    private readonly selfHostInstallationService: SelfHostInstallationService,
  ) {}

  /**
   * Record a self-hosted installation lifecycle event (install, upgrade, uninstall).
   * Public — no authentication. IP is taken from the request, never from the body.
   */
  @Post("events")
  async recordEvent(
    @Body() dto: RecordInstallationEventDto,
    @Req() request: Request,
  ): Promise<ServiceResponse<{ id: string }>> {
    try {
      return await this.selfHostInstallationService.recordEvent(
        dto,
        resolveClientIp(request),
      );
    } catch (error) {
      this.logger.error(
        `Record installation event failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }
}

/**
 * Derive the client IP from the HTTP request. Does not trust body-supplied values.
 */
function resolveClientIp(request: Request): string {
  const forwarded = request.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop) {
      return firstHop;
    }
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    const firstHop = forwarded[0].split(",")[0]?.trim();
    if (firstHop) {
      return firstHop;
    }
  }

  return request.ip || request.socket.remoteAddress || "unknown";
}
