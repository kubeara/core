import { Controller, Get, Logger } from "@nestjs/common";
import { SocketClientService } from "../socket-client/socket-client.service";
import { ContainerService } from "../container/container.service";
import { ServerResourcesService } from "../server-resources/server-resources.service";
import type { ServerResourcesMetricsPayload } from "@shared/socket-events";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly socketClientService: SocketClientService,
    private readonly containerService: ContainerService,
    private readonly serverResourcesService: ServerResourcesService,
  ) {}

  /**
   * Returns current health and socket metadata for the running agent.
   */
  @Get()
  health(): {
    status: string;
    agentId: string;
    socketConnected: boolean;
    timestamp: string;
  } {
    try {
      return {
        status: "ok",
        agentId: this.socketClientService.getAgentId(),
        socketConnected: this.socketClientService.isConnected(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Health check failed`);
      throw error;
    }
  }

  /**
   * Runs `docker ps` locally — use to verify the agent can list containers.
   */
  @Get("containers")
  async listContainers(): Promise<{
    count: number;
    containers: unknown[];
    error?: string;
  }> {
    try {
      const result =
        await this.containerService.discoverContainers("health-check");
      return {
        count: result.containers.length,
        containers: result.containers,
        error: result.error,
      };
    } catch (error) {
      this.logger.error(`Health container discovery failed`);
      throw error;
    }
  }

  /**
   * Collects host resource metrics locally — use to verify the agent can read `/proc`.
   */
  @Get("resources")
  async getResources(): Promise<{
    resources?: ServerResourcesMetricsPayload;
    error?: string;
  }> {
    try {
      const result =
        await this.serverResourcesService.collectResources("health-check");
      return {
        resources: result.resources,
        error: result.error,
      };
    } catch (error) {
      this.logger.error(`Health resource collection failed`);
      throw error;
    }
  }
}
