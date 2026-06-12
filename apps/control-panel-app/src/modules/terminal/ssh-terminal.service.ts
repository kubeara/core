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

  async createSession(
    serverId: string,
    userId: string,
    cols: number,
    rows: number,
  ): Promise<string> {
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
        "SSH terminal fallback is not available for local servers without an agent",
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
    const connectionId = `terminal-${sessionId}`;
    const sshOptions = this.buildSshOptions(server, credential);

    const client = await this.sshManager.connect({
      ...sshOptions,
      serverId: connectionId,
    });

    return new Promise<string>((resolve, reject) => {
      client.shell({ term: "xterm-256color", cols, rows }, (error, stream) => {
        if (error || !stream) {
          this.sshManager.disconnect(connectionId);
          reject(
            new BadRequestException(
              `SSH shell failed: ${error?.message ?? "unknown error"}`,
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
            data.toString("utf8"),
          );
        });

        stream.stderr.on("data", (data: Buffer) => {
          this.deploymentGateway.broadcastTerminalOutput(
            sessionId,
            data.toString("utf8"),
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

        this.logger.log(
          `[TERMINAL] SSH fallback session created sessionId=${sessionId} serverId=${serverId}`,
        );

        resolve(sessionId);
      });
    });
  }

  writeInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.stream.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.stream.setWindow(rows, cols, 0, 0);
  }

  closeSession(
    sessionId: string,
    options: { notifyClients?: boolean } = {},
  ): void {
    this.cleanupSession(sessionId, options);
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

    this.logger.log(
      `[TERMINAL] SSH fallback session closed sessionId=${sessionId}`,
    );
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
