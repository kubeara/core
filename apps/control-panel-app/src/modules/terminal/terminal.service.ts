import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";
import { DeploymentEvents } from "@shared/socket-events";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import {
  TerminalConnectDto,
  TerminalConnectResponseDto,
  TerminalDisconnectDto,
} from "./dto";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
} from "./constants/terminal.constants";
import { SshTerminalService } from "./ssh-terminal.service";
import { TerminalTransport } from "./enums/terminal-transport.enum";

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);

  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    @Inject(forwardRef(() => DeploymentGateway))
    private readonly deploymentGateway: DeploymentGateway,
    private readonly sshTerminalService: SshTerminalService,
  ) {}

  /**
   * Connects to a terminal session.
   */
  async connectTerminal(
    userId: string,
    serverId: string,
    body: TerminalConnectDto,
  ): Promise<ServiceResponse<TerminalConnectResponseDto>> {
    try {
      await this.assertActiveServerForUser(serverId, userId);

      const cols = body.cols ?? DEFAULT_TERMINAL_COLS;
      const rows = body.rows ?? DEFAULT_TERMINAL_ROWS;

      const agentSessionId = await this.tryAgentTerminalConnect(
        serverId,
        userId,
        cols,
        rows,
      );

      if (agentSessionId) {
        return {
          message: SUCCESS_MESSAGES.TERMINAL.CONNECTED,
          data: {
            sessionId: agentSessionId,
            serverId,
            transport: TerminalTransport.AGENT,
          },
        };
      }

      try {
        const sessionId = await this.sshTerminalService.createSession(
          serverId,
          userId,
          cols,
          rows,
        );

        return {
          message: SUCCESS_MESSAGES.TERMINAL.SSH_CONNECTED,
          data: {
            sessionId,
            serverId,
            transport: TerminalTransport.SSH,
          },
        };
      } catch (error) {
        const sshDetail =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[TERMINAL] SSH fallback failed for server '${serverId}': ${sshDetail}`,
        );
        throw new BadRequestException(
          `${ERROR_MESSAGES.TERMINAL.CONNECT_FAILED}: ${sshDetail}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to connect terminal for server '${serverId}': ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Disconnects from a terminal session.
   */
  async disconnectTerminal(
    userId: string,
    serverId: string,
    body: TerminalDisconnectDto,
  ): Promise<ServiceResponse<{ disconnected: true }>> {
    try {
      await this.assertActiveServerForUser(serverId, userId);

      const sessionId = body.sessionId.trim();
      const session = this.deploymentGateway.getTerminalSession(sessionId);

      if (
        session &&
        (session.serverId !== serverId || session.userId !== userId)
      ) {
        throw new NotFoundException(ERROR_MESSAGES.TERMINAL.SESSION_NOT_FOUND);
      }

      if (!session) {
        this.deploymentGateway.notifyAgentTerminalDisconnect(
          serverId,
          sessionId,
        );
        return {
          message: SUCCESS_MESSAGES.TERMINAL.DISCONNECTED,
          data: { disconnected: true },
        };
      }

      try {
        this.deploymentGateway.closeTerminalSession(sessionId, {
          notifyAgent: session.transport === TerminalTransport.AGENT,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new BadRequestException(
          `${ERROR_MESSAGES.TERMINAL.DISCONNECT_FAILED}: ${detail}`,
        );
      }

      return {
        message: SUCCESS_MESSAGES.TERMINAL.DISCONNECTED,
        data: { disconnected: true },
      };
    } catch (error) {
      this.logger.error(
        `Failed to disconnect terminal for server '${serverId}': ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Tries to connect to a terminal session using the agent.
   */
  private async tryAgentTerminalConnect(
    serverId: string,
    userId: string,
    cols: number,
    rows: number,
  ): Promise<string | null> {
    try {
      if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        this.logger.warn(
          `[TERMINAL] no connected agent for server '${serverId}', trying SSH fallback`,
        );
        return null;
      }

      const agentVersion =
        this.deploymentGateway.getAgentVersion(serverId) ?? "unknown";
      const supportsTerminal = this.deploymentGateway.agentSupports(
        serverId,
        DeploymentEvents.TERMINAL_CONNECT,
      );

      if (!supportsTerminal) {
        this.logger.warn(
          `[TERMINAL] agent (version ${agentVersion}) does not support terminal for server '${serverId}', trying SSH fallback`,
        );
        return null;
      }

      return await this.deploymentGateway.requestTerminalConnect(
        serverId,
        userId,
        cols,
        rows,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[TERMINAL] agent socket connect failed for server '${serverId}': ${detail}`,
      );
      return null;
    }
  }

  /**
   * Asserts that the server is active for the user.
   */
  private async assertActiveServerForUser(
    serverId: string,
    userId: string,
  ): Promise<ServerEntity> {
    try {
      const server = await this.serverRepository.findOne({
        where: {
          id: serverId,
          userId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (!server) {
        throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
      }

      return server;
    } catch (error) {
      this.logger.error(
        `Failed to assert active server '${serverId}': ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
