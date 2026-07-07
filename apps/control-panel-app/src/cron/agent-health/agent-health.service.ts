import { Injectable, Logger } from "@nestjs/common";

import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { AgentHealthCheckService } from "./agent-health-check.service";
import { AGENT_HEALTH } from "./constants/agent-health.constants";
import { ServerHealthRepository } from "./repositories/server-health.repository";

@Injectable()
export class AgentHealthService {
  private readonly logger = new Logger(AgentHealthService.name);
  private currentServerIndex = 0;

  constructor(
    private readonly serverHealthRepository: ServerHealthRepository,
    private readonly agentHealthCheckService: AgentHealthCheckService,
  ) {}

  /**
   * Fetches the next active server and delegates health checking to the feature service.
   */
  async processNextServer(): Promise<void> {
    let serverId: string | undefined;

    try {
      const activeServerIds =
        await this.serverHealthRepository.findActiveServerIds();

      if (activeServerIds.length === 0) {
        return;
      }

      serverId =
        activeServerIds[this.currentServerIndex % activeServerIds.length];
      this.currentServerIndex =
        (this.currentServerIndex + 1) % Number.MAX_SAFE_INTEGER;

      await this.agentHealthCheckService.checkServer(serverId);
    } catch (error) {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Failed checking server${serverId ? `: ${serverId}` : ""} — ${toErrorMessage(error)}`,
      );

      if (serverId) {
        try {
          await this.serverHealthRepository.updateServerError(serverId, {
            message: toErrorMessage(error),
            timestamp: Date.now(),
          });
        } catch (updateError) {
          this.logger.error(
            `${AGENT_HEALTH.LOG_PREFIX} Failed to persist server error for '${serverId}': ${toErrorMessage(updateError)}`,
          );
        }
      }
    }
  }
}
