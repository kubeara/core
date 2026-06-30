import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  AGENT_HEALTH,
  AGENT_HEALTH_ENV_KEYS,
} from "../constants/agent-health.constants";
import {
  isAgentHealthCronEnabled,
  resolveAgentHealthCronIntervalMs,
} from "../utils/agent-health-cron-config.util";
import { AgentHealthService } from "./agent-health.service";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

@Injectable()
export class AgentHealthCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentHealthCronService.name);
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
