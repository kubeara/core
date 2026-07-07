import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import {
  AGENT_HEALTH_ENV_KEYS,
  AGENT_HEALTH_HEADERS,
} from "../constants/agent-health.constants";
import { AgentHealthTickResult } from "../interfaces/agent-health-tick-result.interface";
import { AgentHealthCheckService } from "../services/agent-health-check.service";

@Controller("servers/agent-health")
export class AgentHealthController {
  private readonly logger = new Logger(AgentHealthController.name);

  constructor(
    private readonly agentHealthCheckService: AgentHealthCheckService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Runs one agent health cron tick (internal — secured via shared secret header).
   *
   * @param req - Incoming HTTP request carrying the cron secret header.
   * @returns Service envelope with tick outcome data.
   */
  @Post("cron-tick")
  @HttpCode(HttpStatus.OK)
  async runCronTick(
    @Req() req: Request,
  ): Promise<ServiceResponse<AgentHealthTickResult>> {
    try {
      this.assertCronSecret(req);

      const data = await this.agentHealthCheckService.runCronTick();

      return {
        message: "Agent health tick completed",
        data,
      };
    } catch (error) {
      this.logger.error(
        `Agent health cron tick endpoint failed: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Validates the internal cron secret header.
   *
   * @param req - Incoming HTTP request.
   * @returns void
   */
  private assertCronSecret(req: Request): void {
    try {
      const expected = this.configService
        .get<string>(AGENT_HEALTH_ENV_KEYS.CRON_INTERNAL_SECRET)
        ?.trim();

      if (!expected) {
        throw new UnauthorizedException(
          "Cron internal secret is not configured",
        );
      }

      const provided = req.header(AGENT_HEALTH_HEADERS.CRON_SECRET)?.trim();
      if (!provided || provided !== expected) {
        throw new UnauthorizedException("Invalid cron internal secret");
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(
        `Cron secret validation failed: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new UnauthorizedException("Cron secret validation failed");
    }
  }
}
