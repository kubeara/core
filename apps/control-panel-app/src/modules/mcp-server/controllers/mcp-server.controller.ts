import {
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

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { McpOAuthConfigService } from "@control-panel/modules/mcp-oauth/services/mcp-oauth-config.service";

import {
  MCP_JSON_RPC_ERROR_CODES,
  MCP_JSON_RPC_NULL_ID,
  MCP_JSON_RPC_VERSION,
  MCP_UNAUTHENTICATED_METHODS,
} from "../constants/mcp-server.constants";
import { JsonRpcRequest } from "../interfaces/json-rpc-request.interface";
import { McpAuthService } from "../services/mcp-auth.service";
import { McpServerService } from "../services/mcp-server.service";

@Controller("mcp")
export class McpServerController {
  private readonly logger = new Logger(McpServerController.name);

  constructor(
    private readonly mcpAuthService: McpAuthService,
    private readonly mcpServerService: McpServerService,
    private readonly mcpOAuthConfigService: McpOAuthConfigService,
  ) {}

  /**
   * Handle a MCP request.
   */
  @Post()
  async handlePost(
    @Req() req: Request,
    @Res() res: Response,
    @Headers("authorization") authHeader: string,
  ): Promise<void> {
    try {
      const body = (req.body ?? {}) as JsonRpcRequest;
      const method = body.method ?? "";
      const isPublicMethod = MCP_UNAUTHENTICATED_METHODS.has(method);

      if (!method) {
        this.sendUnauthorizedChallenge(
          res,
          ERROR_MESSAGES.MCP_API_KEYS.MISSING_AUTHORIZATION,
        );
        return;
      }

      let userId: string | undefined;

      try {
        const user = await this.mcpAuthService.validateToken(authHeader);
        userId = user.id;
      } catch (authError) {
        if (!isPublicMethod) {
          throw authError;
        }
      }

      const server = this.mcpServerService.createServer(userId ?? "");
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      await server.connect(transport);
      req.headers.accept = "application/json, text/event-stream";
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

        if (statusCode === 401) {
          this.sendUnauthorizedChallenge(res, message);
          return;
        }

        res.status(statusCode).json({
          jsonrpc: MCP_JSON_RPC_VERSION,
          error: { code: errorCode, message },
          id: MCP_JSON_RPC_NULL_ID,
        });
      }
    }
  }

  /**
   * Unauthenticated GET — return 401 + WWW-Authenticate so OAuth clients can discover metadata.
   */
  @Get()
  handleGet(@Res() res: Response): void {
    this.sendUnauthorizedChallenge(
      res,
      ERROR_MESSAGES.MCP_API_KEYS.MISSING_AUTHORIZATION,
    );
  }

  /**
   * Handle a MCP DELETE request.
   */
  @Delete()
  handleDelete(@Res() res: Response): void {
    res.status(405).json({
      jsonrpc: MCP_JSON_RPC_VERSION,
      error: {
        code: MCP_JSON_RPC_ERROR_CODES.METHOD_NOT_ALLOWED,
        message: ERROR_MESSAGES.MCP_SERVER.METHOD_NOT_ALLOWED,
      },
      id: MCP_JSON_RPC_NULL_ID,
    });
  }

  /**
   * Send an unauthorized challenge
   * @param res
   * @param message
   */
  private sendUnauthorizedChallenge(res: Response, message: string): void {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${this.mcpOAuthConfigService.getProtectedResourceMetadataUrl()}", error="invalid_token", error_description="${message}"`,
    );
    res.status(401).json({
      jsonrpc: MCP_JSON_RPC_VERSION,
      error: {
        code: MCP_JSON_RPC_ERROR_CODES.UNAUTHORIZED,
        message,
      },
      id: MCP_JSON_RPC_NULL_ID,
    });
  }

  /**
   * Map an error to a JSON-RPC error
   * @param error
   * @returns The JSON-RPC error
   */
  private mapErrorToJsonRpc(error: unknown): {
    statusCode: number;
    errorCode: number;
    message: string;
  } {
    const message =
      error instanceof Error
        ? error.message
        : ERROR_MESSAGES.MCP_SERVER.INTERNAL_SERVER_ERROR;

    if (error instanceof UnauthorizedException) {
      return {
        statusCode: 401,
        errorCode: MCP_JSON_RPC_ERROR_CODES.UNAUTHORIZED,
        message,
      };
    }

    if (error instanceof HttpException) {
      return {
        statusCode: error.getStatus(),
        errorCode: MCP_JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message,
      };
    }

    return {
      statusCode: 500,
      errorCode: MCP_JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
      message,
    };
  }
}
