import { Controller, Get } from "@nestjs/common";
import { SocketClientService } from "../socket-client/socket-client.service";
import { ContainerDiscoveryService } from "../container-discovery/container-discovery.service";
import { ServerResourcesService } from "../server-resources/server-resources.service";
import type { ServerResourcesMetricsPayload } from "@shared/socket-events";

@Controller("health")
export class HealthController {
  /**
   * Creates health controller with socket client dependency.
   * @param socketClientService Connected agent socket state provider.
   */
  constructor(
    private readonly socketClientService: SocketClientService,
    private readonly containerDiscoveryService: ContainerDiscoveryService,
    private readonly serverResourcesService: ServerResourcesService,
  ) {}

  /**
   * Returns current health and socket metadata for the running agent.
   * @returns Health payload used by probes and diagnostics.
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
      throw new Error(
        `Failed to build health response: ${error instanceof Error ? error.message : String(error)}`,
      );
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
    const result =
      await this.containerDiscoveryService.discoverContainers("health-check");
    return {
      count: result.containers.length,
      containers: result.containers,
      error: result.error,
    };
  }

  /**
   * Collects host resource metrics locally — use to verify the agent can read `/proc`.
   */
  @Get("resources")
  async getResources(): Promise<{
    resources?: ServerResourcesMetricsPayload;
    error?: string;
  }> {
    const result =
      await this.serverResourcesService.collectResources("health-check");
    return {
      resources: result.resources,
      error: result.error,
    };
  }
}
