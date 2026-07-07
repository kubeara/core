import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { toErrorMessage } from "@control-panel/common/utils/error.util";
import {
  AGENT_HEALTH,
  AGENT_HEALTH_ENV_KEYS,
} from "./constants/agent-health.constants";

import {
  isAgentHealthCronEnabled,
  resolveAgentHealthCronIntervalMs,
} from "./agent-health-cron-config.util";
import { AgentHealthService } from "./agent-health.service";

const AGENT_HEALTH_CRON_JOB = "agent-health";

@Injectable()
export class AgentHealthCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentHealthCron.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly agentHealthService: AgentHealthService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!isAgentHealthCronEnabled(this.configService)) {
      this.logger.log(
        `${AGENT_HEALTH.LOG_PREFIX} Cron disabled via ${AGENT_HEALTH_ENV_KEYS.CRON_ENABLED}`,
      );
      return;
    }

    const intervalMs = resolveAgentHealthCronIntervalMs(this.configService);

    this.logger.log(
      `${AGENT_HEALTH.LOG_PREFIX} Cron enabled (interval=${intervalMs}ms)`,
    );

    this.intervalHandle = setInterval(() => {
      void this.agentHealthService.processNextServer().catch((error) => {
        this.logger.error(
          `${AGENT_HEALTH.LOG_PREFIX} Cron tick failed: ${toErrorMessage(error)}`,
        );
      });
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}

export { AGENT_HEALTH_CRON_JOB };
