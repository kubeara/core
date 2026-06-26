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
