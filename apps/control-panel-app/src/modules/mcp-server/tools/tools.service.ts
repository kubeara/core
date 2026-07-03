import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { AuthService } from "@control-panel/modules/auth/auth.service";
import { DeploymentsService } from "@control-panel/modules/deployments/deployments.service";
import type { ServerContainerDto } from "@control-panel/modules/deployments/dto/server-container.dto";
import { ManagedType } from "@control-panel/modules/deployments/enums/managed-type.enum";
import { ServerResponseDto } from "@control-panel/modules/server-connections/dto/server-response.dto";
import { ServerResourcesResponseDto } from "@control-panel/modules/server-connections/dto/server-resources-response.dto";
import { ServerConnectionsService } from "@control-panel/modules/server-connections/services/server-connections.service";
import { ServiceTemplateService } from "@control-panel/modules/service-template/services/service-template.service";

import {
  MCP_SERVER_LIST_LIMIT,
  MCP_TEMPLATE_LIST_DEFAULT_LIMIT,
  MCP_TEMPLATE_LIST_MAX_LIMIT,
} from "../constants/mcp-tools.constants";
import { MCP_TOOL_NAMES, McpToolName } from "../constants/mcp-server.constants";
import { resolveServiceNameToTemplateSlug } from "./resolve-mcp-service-template.util";

@Injectable()
export class McpToolsService {
  constructor(
    private readonly authService: AuthService,
    private readonly serverConnectionsService: ServerConnectionsService,
    private readonly serviceTemplateService: ServiceTemplateService,
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

        case MCP_TOOL_NAMES.LIST_SERVICES:
          result = await this.listServices(userId, args);
          break;

        case MCP_TOOL_NAMES.DEPLOY_SERVICE:
          result = await this.deployService(
            userId,
            this.requireNamedStringArg(args.serviceName, "serviceName"),
            this.requireNamedStringArg(args.serverName, "serverName"),
            this.optionalBooleanArg(args.skipIfDeployed, true),
          );
          break;

        case MCP_TOOL_NAMES.GET_DEPLOYMENT_STATUS:
          result = await this.getDeploymentStatus(userId, args);
          break;

        case MCP_TOOL_NAMES.GET_SERVER_STATUS:
          result = await this.getServerStatus(
            userId,
            this.requireNamedStringArg(args.serverName, "serverName"),
          );
          break;

        case MCP_TOOL_NAMES.GET_GPU_METRICS:
          result = await this.getGpuMetrics(
            userId,
            this.requireNamedStringArg(args.serverName, "serverName"),
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
        error instanceof BadRequestException ||
        error instanceof ConflictException
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

  private async listServers(userId: string) {
    try {
      const response = await this.serverConnectionsService.listServers(userId, {
        page: 1,
        limit: MCP_SERVER_LIST_LIMIT,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      return response.data.data.map((server) => ({
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port,
        connected: server.agentConnected,
        agentConnected: server.agentConnected,
        status: server.status,
        serverType: server.serverType,
        provider: server.provider,
        region: server.region,
        operatingSystem: server.operatingSystem,
        lastConnectedAt: server.lastConnectedAt,
      }));
    } catch (error) {
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
   * List deployable services (templates) with optional search and filters.
   */
  private async listServices(userId: string, args: Record<string, unknown>) {
    void userId;

    try {
      const page = this.optionalPositiveInt(args.page, 1);
      const limit = this.optionalPositiveInt(
        args.limit,
        MCP_TEMPLATE_LIST_DEFAULT_LIMIT,
        MCP_TEMPLATE_LIST_MAX_LIMIT,
      );
      const search =
        typeof args.search === "string" && args.search.trim()
          ? args.search.trim()
          : undefined;
      const category =
        typeof args.category === "string" && args.category.trim()
          ? args.category.trim()
          : undefined;

      const response = await this.serviceTemplateService.listTemplatesPaginated(
        {
          page,
          limit,
          search,
          category,
        },
      );

      return {
        services: response.data.data.map((template) => ({
          slug: template.slug,
          name: template.name,
          description: template.shortDescription,
          categories: template.category,
          tags: template.tags,
          port: template.port,
        })),
        pagination: response.data.pagination,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to list services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Deploy a service to a server by name. Skips when already deployed unless
   * skipIfDeployed is false.
   */
  private async deployService(
    userId: string,
    serviceName: string,
    serverName: string,
    skipIfDeployed: boolean,
  ) {
    try {
      const server = await this.findServerByNameOrId(userId, serverName);

      if (!server.agentConnected) {
        throw new BadRequestException(
          `Server '${server.name}' is not connected. Install and connect the Kubeara agent before deploying.`,
        );
      }

      const templateSlug = await resolveServiceNameToTemplateSlug(
        this.serviceTemplateService,
        serviceName,
      );

      if (skipIfDeployed) {
        const existing = await this.findDeployedServiceOnServer(
          userId,
          server.id,
          templateSlug,
        );

        if (existing) {
          return {
            action: "skipped",
            reason: "Service already deployed on this server",
            service: templateSlug,
            server: server.name,
            serverId: server.id,
            deploymentId: existing.deploymentId,
          };
        }
      }

      const serverUrlContext =
        await this.deploymentsService.buildServerUrlContext({
          userId,
          serverId: server.id,
        });

      const prepared = await this.deploymentsService.prepareComposeDeployment({
        templateSlug,
        serverId: server.id,
        userId,
        requestEnv: {},
        requestPorts: {},
        serverUrlContext,
      });

      const result = this.deploymentsService.schedulePreparedDeployment(
        prepared,
        false,
        {
          skipResourceValidation: true,
        },
      );

      return {
        action: "deploying",
        service: templateSlug,
        server: server.name,
        serverId: server.id,
        deploymentId: result.deploymentId,
        message: result.message,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to deploy service: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns the current deployment status from the database.
   * Accepts deploymentId directly, or serviceName + serverName to find the latest deployment.
   */
  private async getDeploymentStatus(
    userId: string,
    args: Record<string, unknown>,
  ) {
    try {
      const deploymentId = await this.resolveDeploymentIdForStatus(userId, args);
      const deployment =
        await this.deploymentsService.getDeployment(deploymentId);

      return this.formatDeploymentStatus(deployment);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to get deployment status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolve the deployment ID for the status.
   * @param userId - The ID of the user.  Resolve the deployment ID for the status.
   * @param args - The arguments passed to the tool.
   * @returns The deployment ID.
   * @returns The deployment ID. If not found, throw a BadRequestException.
   */
  private async resolveDeploymentIdForStatus(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const deploymentId =
      typeof args.deploymentId === "string" && args.deploymentId.trim()
        ? args.deploymentId.trim()
        : undefined;

    if (deploymentId) {
      return deploymentId;
    }

    const serviceName =
      typeof args.serviceName === "string" && args.serviceName.trim()
        ? args.serviceName.trim()
        : undefined;
    const serverName =
      typeof args.serverName === "string" && args.serverName.trim()
        ? args.serverName.trim()
        : undefined;

    if (serviceName && serverName) {
      const server = await this.findServerByNameOrId(userId, serverName);
      const templateSlug = await resolveServiceNameToTemplateSlug(
        this.serviceTemplateService,
        serviceName,
      );
      const deployment =
        await this.deploymentsService.getLatestDeploymentForServerAndTemplate({
          userId,
          serverId: server.id,
          templateSlug,
        });

      return deployment.id;
    }

    throw new BadRequestException(
      "Provide deploymentId or both serviceName and serverName",
    );
  }

  /**
   * Format the deployment status into a readable format.
   * @param deployment - The deployment to format.
   * @returns The formatted deployment status.
   */
  private formatDeploymentStatus(
    deployment: Awaited<
      ReturnType<DeploymentsService["getDeployment"]>
    >,
  ) {
    return {
      deploymentId: deployment.id,
      templateSlug: deployment.templateSlug,
      serverId: deployment.serverId,
      deploymentStatus: deployment.deploymentStatus,
      statusMessage: deployment.statusMessage,
      lastError: deployment.lastError,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
    };
  }

  private async findDeployedServiceOnServer(
    userId: string,
    serverId: string,
    templateSlug: string,
  ): Promise<ServerContainerDto | null> {
    const containers = await this.deploymentsService.listServerContainers(
      serverId,
      userId,
    );

    return (
      containers.find(
        (container) =>
          container.managedType === ManagedType.KUBEARA_MANAGED &&
          container.templateId === templateSlug &&
          container.isOnline,
      ) ?? null
    );
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
  private requireNamedStringArg(value: unknown, name: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new BadRequestException(`${name} is required`);
    }

    return value.trim();
  }

  private optionalBooleanArg(value: unknown, fallback: boolean): boolean {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }

    throw new BadRequestException("skipIfDeployed must be a boolean");
  }

  private optionalPositiveInt(
    value: unknown,
    fallback: number,
    max?: number,
  ): number {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }

    let parsed: number;

    if (typeof value === "number") {
      parsed = value;
    } else if (typeof value === "string") {
      parsed = Number.parseInt(value, 10);
    } else {
      throw new BadRequestException("page and limit must be positive integers");
    }

    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException("page and limit must be positive integers");
    }

    if (max !== undefined && parsed > max) {
      return max;
    }

    return parsed;
  }
}
