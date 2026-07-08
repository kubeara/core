import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import axios from "axios";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

const CRON_AGENT_HEALTH_PATH = "/api/servers/cron/agent-health";

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly configService: ConfigService) {}

  @Cron(CronExpression.EVERY_SECOND)
  /**
   * Fires the internal agent-health tick every second.
   * @returns Resolves when the HTTP request completes or fails (errors are logged, not thrown).
   */
  async runAgentHealthCheck(): Promise<void> {
    if (this.configService.get<string>("CRON_ENABLED") === "false") {
      return;
    }

    try {
      const port = this.configService.get<string>("PORT");

      if (!port) {
        this.logger.error("PORT is not configured");
        return;
      }

      const baseUrl =
        this.configService.get<string>("CRON_INTERNAL_BASE_URL") ??
        `http://127.0.0.1:${port}`;

      await axios.post(
        `${baseUrl}${CRON_AGENT_HEALTH_PATH}`,
        {},
        {
          timeout: 30_000,
        },
      );
    } catch (error) {
      this.logger.error(
        `Agent health cron request failed: ${toErrorMessage(error)}`,
      );
    }
  }
}
