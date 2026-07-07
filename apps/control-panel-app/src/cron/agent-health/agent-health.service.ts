import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import axios from "axios";

import { toErrorMessage } from "@control-panel/common/utils/error.util";
import {
  AGENT_HEALTH_CRON_JOB_NAME,
  AGENT_HEALTH_DEFAULT_CRON_INTERVAL_MS,
  AGENT_HEALTH_ENV_KEYS,
  AGENT_HEALTH_HEADERS,
  AGENT_HEALTH_ROUTES,
} from "@control-panel/modules/server-connections/constants/agent-health.constants";

@Injectable()
export class AgentHealthService implements OnModuleInit {
  private readonly logger = new Logger(AgentHealthService.name);
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Registers the agent health interval job using @nestjs/schedule.
   *
   * @returns void
   */
  onModuleInit(): void {
    try {
      if (!this.isCronEnabled()) {
        this.logger.log("Agent health cron is disabled");
        return;
      }

      const intervalMs = this.resolveIntervalMs();
      const interval = setInterval(() => {
        void this.checkNextServerHealth();
      }, intervalMs);

      this.schedulerRegistry.addInterval(AGENT_HEALTH_CRON_JOB_NAME, interval);
      this.logger.log(`Agent health cron started (every ${intervalMs}ms)`);
    } catch (error) {
      this.logger.error(
        `Failed to start agent health cron: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Invokes one agent health tick via the internal HTTP endpoint.
   *
   * @returns Resolves when the HTTP call completes.
   */
  async checkNextServerHealth(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const url = this.resolveCronTickUrl();
      const secret = this.configService
        .get<string>(AGENT_HEALTH_ENV_KEYS.CRON_INTERNAL_SECRET)
        ?.trim();

      if (!secret) {
        this.logger.warn(
          `${AGENT_HEALTH_ENV_KEYS.CRON_INTERNAL_SECRET} is not configured`,
        );
        return;
      }

      await axios.post(
        url,
        {},
        { headers: { [AGENT_HEALTH_HEADERS.CRON_SECRET]: secret } },
      );
    } catch (error) {
      this.logger.error(
        `Agent health cron failed: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * @returns True when the cron is enabled via env configuration.
   */
  private isCronEnabled(): boolean {
    const flag = this.configService
      .get<string>(AGENT_HEALTH_ENV_KEYS.CRON_ENABLED)
      ?.trim()
      .toLowerCase();

    return flag !== "false";
  }

  /**
   * @returns Cron interval in milliseconds from env or the default constant.
   */
  private resolveIntervalMs(): number {
    const fromEnv = Number(
      this.configService.get<string>(AGENT_HEALTH_ENV_KEYS.CRON_INTERVAL_MS),
    );

    if (Number.isFinite(fromEnv) && fromEnv > 0) {
      return fromEnv;
    }

    return AGENT_HEALTH_DEFAULT_CRON_INTERVAL_MS;
  }

  /**
   * @returns Fully qualified internal cron tick URL.
   */
  private resolveCronTickUrl(): string {
    const configuredBase = this.configService
      .get<string>(AGENT_HEALTH_ENV_KEYS.CRON_INTERNAL_BASE_URL)
      ?.trim()
      .replace(/\/+$/, "");

    const port = Number(this.configService.get<string>("PORT"));
    const baseUrl =
      configuredBase ??
      (Number.isFinite(port) ? `http://127.0.0.1:${port}` : null);

    if (!baseUrl) {
      throw new Error(
        `Set ${AGENT_HEALTH_ENV_KEYS.CRON_INTERNAL_BASE_URL} or PORT`,
      );
    }

    return `${baseUrl}${AGENT_HEALTH_ROUTES.CRON_TICK}`;
  }
}
