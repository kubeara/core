import { Injectable, Logger } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOOL_NAMES,
} from "../constants/mcp-server.constants";
import { McpToolsService } from "../tools/tools.service";

@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name);

  constructor(private readonly mcpToolsService: McpToolsService) {}

  /**
   * Create a new MCP server.
   * @param userId - The ID of the user creating the server.
   * @returns A MCP server.
   */
  createServer(userId: string): McpServer {
    try {
      const server = new McpServer(
        { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        { capabilities: { tools: {} } },
      );

      server.registerTool(
        MCP_TOOL_NAMES.LIST_SERVERS,
        {
          description: "List all servers for user",
          inputSchema: {},
        },
        () =>
          this.mcpToolsService.executeTool(
            MCP_TOOL_NAMES.LIST_SERVERS,
            {},
            userId,
          ),
      );

      server.registerTool(
        MCP_TOOL_NAMES.LIST_SERVICES,
        {
          description:
            "List deployable services (templates) with optional search and category filters",
          inputSchema: {
            search: z
              .string()
              .optional()
              .describe("Search by service name, slug, description, or tags"),
            category: z
              .string()
              .optional()
              .describe("Filter by category (e.g. database, monitoring)"),
            page: z
              .number()
              .int()
              .min(1)
              .optional()
              .describe("Page number (default 1)"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Results per page (default 20, max 100)"),
          },
        },
        (args) =>
          this.mcpToolsService.executeTool(
            MCP_TOOL_NAMES.LIST_SERVICES,
            args,
            userId,
          ),
      );

      server.registerTool(
        MCP_TOOL_NAMES.DEPLOY_SERVICE,
        {
          description:
            "Deploy a service to a server by name. Skips if the service is already running on that server.",
          inputSchema: {
            serviceName: z
              .string()
              .describe(
                "Service name or template slug (e.g. postgres, redis, grafana)",
              ),
            serverName: z.string().describe("Target server name or ID"),
            skipIfDeployed: z
              .boolean()
              .optional()
              .describe(
                "When true (default), skip deploy if the service is already on the server",
              ),
          },
        },
        (args) =>
          this.mcpToolsService.executeTool(
            MCP_TOOL_NAMES.DEPLOY_SERVICE,
            args,
            userId,
          ),
      );

      server.registerTool(
        MCP_TOOL_NAMES.GET_DEPLOYMENT_STATUS,
        {
          description:
            "Get the current deployment status (success, failed, deploying, etc.). Provide deploymentId from deploy_service, or serviceName + serverName to look up the latest deployment.",
          inputSchema: {
            deploymentId: z
              .string()
              .optional()
              .describe(
                "Deployment ID returned by deploy_service (preferred when available)",
              ),
            serviceName: z
              .string()
              .optional()
              .describe(
                "Service name or template slug — use with serverName when deploymentId is unknown",
              ),
            serverName: z
              .string()
              .optional()
              .describe(
                "Server name or ID — use with serviceName when deploymentId is unknown",
              ),
          },
        },
        (args) =>
          this.mcpToolsService.executeTool(
            MCP_TOOL_NAMES.GET_DEPLOYMENT_STATUS,
            args,
            userId,
          ),
      );

      server.registerTool(
        MCP_TOOL_NAMES.GET_SERVER_STATUS,
        {
          description: "Server status/metrics",
          inputSchema: {
            serverName: z.string().describe("Name of the server"),
          },
        },
        ({ serverName }) =>
          this.mcpToolsService.executeTool(
            MCP_TOOL_NAMES.GET_SERVER_STATUS,
            { serverName },
            userId,
          ),
      );

      server.registerTool(
        MCP_TOOL_NAMES.GET_GPU_METRICS,
        {
          description: "GPU utilization/VRAM",
          inputSchema: {
            serverName: z.string().describe("Name of the server"),
          },
        },
        ({ serverName }) =>
          this.mcpToolsService.executeTool(
            MCP_TOOL_NAMES.GET_GPU_METRICS,
            { serverName },
            userId,
          ),
      );

      server.registerTool(
        MCP_TOOL_NAMES.GET_CURRENT_USER,
        {
          description: "Get the authenticated user's profile",
          inputSchema: {},
        },
        () =>
          this.mcpToolsService.executeTool(
            MCP_TOOL_NAMES.GET_CURRENT_USER,
            {},
            userId,
          ),
      );

      return server;
    } catch (error) {
      this.logger.error(
        `Create MCP server failed for user '${userId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }
}
