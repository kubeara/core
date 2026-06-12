import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { MCP_JSON_RPC_METHODS } from "../constants/mcp-server.constants";
import { JsonRpcRequest } from "../interfaces/json-rpc-request.interface";
import { McpAuthService } from "../services/mcp-auth.service";
import { McpServerService } from "../services/mcp-server.service";

@Controller("mcp")
export class McpServerController {
  private readonly logger = new Logger(McpServerController.name);

  constructor(
    private readonly mcpAuthService: McpAuthService,
    private readonly mcpServerService: McpServerService,
  ) {}

  /**
   * Handle a MCP request.
   * @param req - The request object.
   * @param res - The response object.
   * @param body - The body of the request.
   * @param authHeader - The authorization header.
   * @returns A promise that resolves to void.
   */
  @Post()
  async handlePost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: JsonRpcRequest,
    @Headers("authorization") authHeader: string,
  ): Promise<void> {
    try {
      let userId = "user-001";

      if (body.method !== MCP_JSON_RPC_METHODS.INITIALIZE) {
        const user = await this.mcpAuthService.validateToken(authHeader);
        userId = user.id;
      }

      const server = this.mcpServerService.createServer(userId);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error: unknown) {
      this.logger.error(
        "MCP request failed",
        error instanceof Error ? error.stack : String(error),
      );

      if (!res.headersSent) {
        const { statusCode, errorCode, message } =
          this.mapErrorToJsonRpc(error);

        res.status(statusCode).json({
          jsonrpc: "2.0",
          error: { code: errorCode, message },
          id: null,
        });
      }
    }
  }

  /**
   * Handle a MCP GET request.
   * @param res - The response object.
   * @returns A promise that resolves to void.
   */
  @Get()
  handleGet(@Res() res: Response): void {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  }
  /**
   * Handle a MCP DELETE request.
   * @param res - The response object.
   * @returns A promise that resolves to void.
   */
  @Delete()
  handleDelete(@Res() res: Response): void {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  }

  /**
   * Map an error to a JSON-RPC error.
   * @param error - The error to map.
   * @returns A JSON-RPC error.
   */
  private mapErrorToJsonRpc(error: unknown): {
    statusCode: number;
    errorCode: number;
    message: string;
  } {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    if (error instanceof UnauthorizedException) {
      return {
        statusCode: 401,
        errorCode: -32001,
        message,
      };
    }

    if (error instanceof HttpException) {
      return {
        statusCode: error.getStatus(),
        errorCode: -32603,
        message,
      };
    }

    return {
      statusCode: 500,
      errorCode: -32603,
      message,
    };
  }
}
