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
import { randomUUID } from "node:crypto";
import { SshConnectionManager, SshConnectionOptions } from "@shared/ssh";
import { logStructured, logStructuredError } from "@shared/common";
import {
  SSH_TERMINAL_CONNECTION_ID_PREFIX,
  SSH_TERMINAL_WINDOW_PIXELS,
  TERMINAL_OUTPUT_ENCODING,
  TERMINAL_TERM_TYPE,
} from "@shared/common";
import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { ServerSshCredentialEntity } from "@control-panel/modules/server-connections/entities/server-ssh-credential.entity";
import { ServerType } from "@control-panel/modules/server-connections/enums/server-type.enum";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { TerminalTransport } from "./enums/terminal-transport.enum";
import { SshTerminalSession } from "./interfaces/ssh-terminal-session.interface";

@Injectable()
export class SshTerminalService {
  private readonly logger = new Logger(SshTerminalService.name);
  private readonly sessions = new Map<string, SshTerminalSession>();

  constructor(
    private readonly sshManager: SshConnectionManager,
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    @InjectRepository(ServerSshCredentialEntity)
    private readonly credentialRepository: Repository<ServerSshCredentialEntity>,
    @Inject(forwardRef(() => DeploymentGateway))
    private readonly deploymentGateway: DeploymentGateway,
  ) {}

  /**
   * Creates an SSH fallback terminal session for the given server.
   */
  async createSession(
    serverId: string,
    userId: string,
    cols: number,
    rows: number,
  ): Promise<string> {
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

      if (server.serverType === ServerType.LOCAL) {
        throw new BadRequestException(
          ERROR_MESSAGES.TERMINAL.SSH_LOCAL_UNAVAILABLE,
        );
      }

      const credential = await this.credentialRepository.findOne({
        where: {
          serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        order: { createdAt: "DESC" },
      });

      if (!credential) {
        throw new BadRequestException(
          ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        );
      }

      const sessionId = randomUUID();
      const connectionId = `${SSH_TERMINAL_CONNECTION_ID_PREFIX}${sessionId}`;
      const sshOptions = this.buildSshOptions(server, credential);

      const client = await this.sshManager.connect({
        ...sshOptions,
        serverId: connectionId,
      });

      return new Promise<string>((resolve, reject) => {
        try {
          client.shell(
            { term: TERMINAL_TERM_TYPE, cols, rows },
            (error, stream) => {
              if (error || !stream) {
                this.sshManager.disconnect(connectionId);
                reject(
                  new BadRequestException(
                    `${ERROR_MESSAGES.TERMINAL.SSH_SHELL_FAILED}: ${error?.message ?? ERROR_MESSAGES.TERMINAL.UNKNOWN_ERROR}`,
                  ),
                );
                return;
              }

              this.sessions.set(sessionId, {
                sessionId,
                serverId,
                connectionId,
                stream,
              });

              stream.on("data", (data: Buffer) => {
                this.deploymentGateway.broadcastTerminalOutput(
                  sessionId,
                  data.toString(TERMINAL_OUTPUT_ENCODING),
                );
              });

              stream.stderr.on("data", (data: Buffer) => {
                this.deploymentGateway.broadcastTerminalOutput(
                  sessionId,
                  data.toString(TERMINAL_OUTPUT_ENCODING),
                );
              });

              stream.on("close", () => {
                this.cleanupSession(sessionId, { notifyClients: true });
              });

              this.deploymentGateway.registerTerminalSession(
                sessionId,
                serverId,
                userId,
                TerminalTransport.SSH,
              );

              logStructured(this.logger, "log", "terminal.session", "started", {
                module: "SshTerminalService",
                sessionId,
                serverId,
                transport: "ssh",
              });

              resolve(sessionId);
            },
          );
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error) {
      logStructuredError(this.logger, "terminal.session.create", error, {
        module: "SshTerminalService",
        serverId,
      });
      throw error;
    }
  }

  /**
   * Writes input to an SSH terminal session.
   */
  writeInput(sessionId: string, data: string): void {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return;
      }

      session.stream.write(data);
    } catch (error) {
      this.logger.error(
        `Failed to write SSH terminal input sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resizes an SSH terminal session.
   */
  resize(sessionId: string, cols: number, rows: number): void {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return;
      }

      session.stream.setWindow(
        rows,
        cols,
        SSH_TERMINAL_WINDOW_PIXELS.HEIGHT,
        SSH_TERMINAL_WINDOW_PIXELS.WIDTH,
      );
    } catch (error) {
      this.logger.error(
        `Failed to resize SSH terminal sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Closes an SSH terminal session.
   */
  closeSession(
    sessionId: string,
    options: { notifyClients?: boolean } = {},
  ): void {
    try {
      this.cleanupSession(sessionId, options);
    } catch (error) {
      this.logger.error(
        `Failed to close SSH terminal sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private cleanupSession(
    sessionId: string,
    options: { notifyClients?: boolean },
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.sessions.delete(sessionId);

    try {
      session.stream.close();
    } catch {
      // stream may already be closed
    }

    this.sshManager.disconnect(session.connectionId);

    if (options.notifyClients) {
      this.deploymentGateway.closeTerminalSession(sessionId, {
        notifyAgent: false,
        skipTransportClose: true,
      });
    }

    logStructured(this.logger, "log", "terminal.session", "succeeded", {
      module: "SshTerminalService",
      sessionId,
      action: "closed",
      transport: "ssh",
    });
  }

  private buildSshOptions(
    server: ServerEntity,
    credential: ServerSshCredentialEntity,
  ): SshConnectionOptions {
    return {
      serverId: server.id,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: credential.authType,
      encryptedPassword: credential.encryptedPassword ?? null,
      encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
      privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
    };
  }
}
