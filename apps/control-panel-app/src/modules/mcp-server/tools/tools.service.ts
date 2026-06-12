import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { AuthService } from "@control-panel/modules/auth/auth.service";
import { DeploymentsService } from "@control-panel/modules/deployments/deployments.service";
import { ServerResponseDto } from "@control-panel/modules/server-connections/dto/server-response.dto";
import { ServerResourcesResponseDto } from "@control-panel/modules/server-connections/dto/server-resources-response.dto";
import { ServerConnectionsService } from "@control-panel/modules/server-connections/services/server-connections.service";

import { MCP_TOOL_NAMES, McpToolName } from "../constants/mcp-server.constants";

const MCP_SERVER_LIST_LIMIT = 100;

const SERVICE_NAME_TO_TEMPLATE_SLUG: Record<string, string> = {
  redis: "redis",
  postgresql: "postgres",
  postgres: "postgres",
  postgresv2: "postgres",
  n8n: "n8n",
  grafana: "grafana",
  gitea: "gitea",
  gitlab: "gitlab-ce",
  "gitlab-ce": "gitlab-ce",
  wordpress: "wordpress",
  directus: "directus",
  strapi: "strapi",
  prometheus: "prometheus",
  "uptime-kuma": "uptime-kuma",
  "uptime kuma": "uptime-kuma",
  "code-server": "code-server",
  "sql-server": "sql-server",
};

@Injectable()
export class McpToolsService {
  constructor(
    private readonly authService: AuthService,
    private readonly serverConnectionsService: ServerConnectionsService,
    private readonly deploymentsService: DeploymentsService,
  ) {}

  /**
   * Execute an MCP tool using the same backend services as the REST API.
   * @param toolName - The name of the MCP tool to execute.
   * @param args - The arguments passed to the tool.
   * @param userId - The ID of the authenticated user.
   * @returns A promise that resolves to the MCP tool call result.
   */
  async executeTool(
    toolName: McpToolName,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<CallToolResult> {
    try {
      let result: unknown;

      switch (toolName) {
        case MCP_TOOL_NAMES.LIST_SERVERS:
          result = await this.listServers(userId);
          break;

        case MCP_TOOL_NAMES.GET_SERVER_STATUS:
          result = await this.getServerStatus(
            userId,
            this.requireStringArg(args.serverName, "serverName"),
          );
          break;

        case MCP_TOOL_NAMES.GET_GPU_METRICS:
          result = await this.getGpuMetrics(
            userId,
            this.requireStringArg(args.serverName, "serverName"),
          );
          break;

        case MCP_TOOL_NAMES.GET_CURRENT_USER:
          result = await this.getCurrentUser(userId);
          break;

        default: {
          const unknownTool = toolName as string;
          throw new BadRequestException(`Unknown tool: ${unknownTool}`);
        }
      }

      return this.toToolResult(result);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to execute MCP tool: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get the profile of the authenticated user.
   * @param userId - The ID of the user.
   * @returns A promise that resolves to the user profile.
   */
  private async getCurrentUser(userId: string) {
    try {
      const response = await this.authService.getProfile(userId);
      return response.data;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to get current user: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List all servers for the authenticated user.
   * @param userId - The ID of the user.
   * @returns A promise that resolves to a list of server summaries.
   */
  private async listServers(userId: string) {
    try {
      console.log("listServers", userId);
      const response = await this.serverConnectionsService.listServers(userId, {
        page: 1,
        limit: MCP_SERVER_LIST_LIMIT,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      console.log("response", response);

      return response.data.data.map((server) => ({
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port,
        connected: server.connected,
        status: server.status,
        serverType: server.serverType,
        provider: server.provider,
        region: server.region,
        operatingSystem: server.operatingSystem,
        lastConnectedAt: server.lastConnectedAt,
      }));
    } catch (error) {
      console.log("error", error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to list servers: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get the current status and resource usage for a server.
   * @param userId - The ID of the user.
   * @param serverName - The server name or ID to look up.
   * @returns A promise that resolves to the formatted server status.
   */
  private async getServerStatus(userId: string, serverName: string) {
    try {
      const server = await this.findServerByNameOrId(userId, serverName);
      const resources = await this.serverConnectionsService.getServerResources(
        userId,
        server.id,
      );

      return this.formatServerStatus(server, resources);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to get server status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get GPU and host resource metrics for a server.
   * @param userId - The ID of the user.
   * @param serverName - The server name or ID to look up.
   * @returns A promise that resolves to CPU, memory, disk, and system metrics.
   */
  private async getGpuMetrics(userId: string, serverName: string) {
    try {
      const server = await this.findServerByNameOrId(userId, serverName);
      const resources = await this.serverConnectionsService.getServerResources(
        userId,
        server.id,
      );

      return {
        server: server.name,
        serverId: server.id,
        note: "GPU metrics are not collected yet. Returning host CPU, memory, and disk metrics instead.",
        cpu: {
          usagePercent: resources.cpu.usagePercent,
          cores: resources.cpu.cores,
          loadAverage: resources.cpu.loadAverage,
        },
        memory: {
          total: this.formatBytes(resources.memory.total),
          used: this.formatBytes(resources.memory.used),
          usagePercent: resources.memory.usagePercent,
        },
        disk: {
          total: this.formatBytes(resources.disk.total),
          used: this.formatBytes(resources.disk.used),
          usagePercent: resources.disk.usagePercent,
        },
        system: resources.system,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to get GPU metrics: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Find a server by name or ID for the authenticated user.
   * @param userId - The ID of the user.
   * @param serverNameOrId - The server name or ID to look up.
   * @returns A promise that resolves to the matching server.
   */
  private async findServerByNameOrId(
    userId: string,
    serverNameOrId: string,
  ): Promise<ServerResponseDto> {
    try {
      const response = await this.serverConnectionsService.listServers(userId, {
        page: 1,
        limit: MCP_SERVER_LIST_LIMIT,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      const normalized = serverNameOrId.trim().toLowerCase();
      const match = response.data.data.find(
        (server) =>
          server.id === serverNameOrId ||
          server.name.toLowerCase() === normalized,
      );

      if (!match) {
        throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
      }

      return match;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to find server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Format server details and resource usage into a status summary.
   * @param server - The server to format.
   * @param resources - The server's current resource usage.
   * @returns A formatted server status object.
   */
  private formatServerStatus(
    server: ServerResponseDto,
    resources: ServerResourcesResponseDto,
  ) {
    const uptimeSeconds = resources.system.uptime;
    const uptimeDays = Math.floor(uptimeSeconds / 86_400);
    const uptimeHours = Math.floor((uptimeSeconds % 86_400) / 3_600);

    return {
      id: server.id,
      name: server.name,
      host: server.host,
      connected: server.connected,
      status: server.connected ? "online" : "offline",
      uptime: `${uptimeDays} days ${uptimeHours} hours`,
      cpu: `${resources.cpu.usagePercent.toFixed(1)}%`,
      ram: `${this.formatBytes(resources.memory.used)} / ${this.formatBytes(resources.memory.total)}`,
      disk: `${this.formatBytes(resources.disk.used)} / ${this.formatBytes(resources.disk.total)}`,
      hostname: resources.system.hostname,
      platform: resources.system.platform,
      architecture: resources.system.architecture,
      timestamp: resources.timestamp,
    };
  }

  /**
   * Resolve a service name to a deployment template slug.
   * @param serviceName - The service name provided by the caller.
   * @returns The resolved template slug.
   */
  private resolveTemplateSlug(serviceName: string): string {
    const normalized = serviceName.trim().toLowerCase();
    const mapped = SERVICE_NAME_TO_TEMPLATE_SLUG[normalized];

    if (mapped) {
      return mapped;
    }

    const slug = normalized.replace(/\s+/g, "-");
    if (!slug) {
      throw new BadRequestException("serviceName is required");
    }

    return slug;
  }

  /**
   * Format a byte count into a human-readable string.
   * @param bytes - The number of bytes to format.
   * @returns A formatted byte string (e.g. "1.5 GB").
   */
  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  /**
   * Convert a tool result into an MCP call tool response.
   * @param result - The tool execution result to serialize.
   * @returns An MCP-compatible tool call result.
   */
  private toToolResult(result: unknown): CallToolResult {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Validate and return a required string argument.
   * @param value - The argument value to validate.
   * @param name - The argument name used in error messages.
   * @returns The trimmed string value.
   */
  private requireStringArg(value: unknown, name?: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new BadRequestException(ERROR_MESSAGES.SERVER.NOT_FOUND);
    }
    if (name && value.trim() === "") {
      throw new BadRequestException(`${name} is required`);
    }
    return value.trim();
  }
}
