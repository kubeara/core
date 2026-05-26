import { ConflictException, Injectable } from "@nestjs/common";
import { DataSource, FindOneOptions, Repository, IsNull } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
  CreateServerDto,
  CreateServerSshCredentialRequestDto,
  CreateServerOnboardRequestDto,
  OnboardResponseDto,
} from "../dto";
import { ServerSshCredentialEntity } from "../entities/server-ssh-credential.entity";
import { ServerEntity } from "../entities/server.entity";
import { EncryptionService } from "@shared/common";
import { ServerSshAuthType } from "../enums/server-ssh-auth-type.enum";
import {
  SshHealthCheckService,
  SshCommandExecutorService,
  ExecuteCommandDto,
  ExecuteResult,
  SshConnectionManager,
  SshConnectionOptions,
} from "@shared/ssh";
import {
  RemoteAgentInstallService,
  AgentInstallResult,
} from "./remote-agent-install.service";
import { DEFAULT_SSH_PORT } from "../server-connections.constants";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import dayjs from "dayjs";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";

export interface ExistingServerCheck {
  host: string;
  username: string;
  userId: string;
}

@Injectable()
export class ServerConnectionsService {
  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    @InjectRepository(ServerSshCredentialEntity)
    private readonly credentialRepository: Repository<ServerSshCredentialEntity>,
    private readonly dataSource: DataSource,
    private readonly encryptionService: EncryptionService,
    private readonly health: SshHealthCheckService,
    private readonly executor: SshCommandExecutorService,
    private readonly sshManager: SshConnectionManager,
    private readonly remoteAgentInstall: RemoteAgentInstallService,
  ) {}

  private shouldInstallAgent(installAgent: boolean | undefined): boolean {
    return installAgent !== false;
  }

  private buildSshOptions(
    server: ServerEntity,
    credential: ServerSshCredentialEntity,
    plainPrivateKey?: string,
  ): SshConnectionOptions {
    return {
      serverId: server.id,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: credential.authType,
      encryptedPassword: credential.encryptedPassword ?? null,
      encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
      privateKey: plainPrivateKey,
      privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
    };
  }

  private async runAgentInstallAfterOnboard(params: {
    installAgent: boolean | undefined;
    server: ServerEntity;
    credential: ServerSshCredentialEntity;
    plainPrivateKey?: string;
    logs: string[];
  }): Promise<AgentInstallResult> {
    if (!this.shouldInstallAgent(params.installAgent)) {
      this.sshManager.disconnect(params.server.id);
      return {
        success: true,
        logs: ["Agent install skipped (installAgent=false)"],
        skipped: true,
      };
    }

    try {
      const result = await this.remoteAgentInstall.install({
        connection: this.buildSshOptions(
          params.server,
          params.credential,
          params.plainPrivateKey,
        ),
        serverHost: params.server.host,
        plainPrivateKey: params.plainPrivateKey,
      });
      params.logs.push(...result.logs);
      return result;
    } finally {
      this.sshManager.disconnect(params.server.id);
    }
  }

  private async getServerConnectionOptions(id: string) {
    const server = await this.serverRepository.findOne({
      where: { id, status: EntityStatus.ACTIVE, deletedAt: IsNull() },
    });

    if (!server) {
      throw new Error(ERROR_MESSAGES.SERVER.NOT_FOUND);
    }

    const credential = await this.credentialRepository.findOne({
      where: { serverId: id },
    });

    if (!credential) {
      throw new Error(ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND);
    }

    return {
      serverId: id,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: credential.authType,
      encryptedPassword: credential.encryptedPassword,
      encryptedPrivateKey: credential.encryptedPrivateKey,
      privateKeyPassphrase: credential.privateKeyPassphrase,
    };
  }

  /**
   * find exisiting server
   * @param input
   * @returns
   */
  private async findExistingServer(
    input: ExistingServerCheck,
  ): Promise<ServerEntity | null> {
    return this.serverRepository.findOne({
      where: {
        host: input.host,
        username: input.username,
        userId: input.userId,
      },
    });
  }

  /**
   * restore from soft delete
   * @param serverId
   * @returns
   */
  private async restoreServer(
    serverId: string,
  ): Promise<ServerSshCredentialEntity | null> {
    await this.serverRepository.update(
      { id: serverId },
      {
        status: EntityStatus.ACTIVE,
        deletedAt: null,
      },
    );

    await this.credentialRepository.update(
      { serverId },
      {
        status: EntityStatus.ACTIVE,
        deletedAt: null,
      },
    );

    return this.credentialRepository.findOne({
      where: { serverId, status: EntityStatus.ACTIVE },
    });
  }

  /**
   * create the server
   * @param input
   * @returns
   */
  async onboardServer(
    input: CreateServerOnboardRequestDto,
    userId: string,
  ): Promise<OnboardResponseDto> {
    const existingServer = await this.findExistingServer({
      host: input.server.host,
      username: input.server.username,
      userId,
    });

    if (existingServer) {
      // Active server already exists
      if (
        existingServer.status === EntityStatus.ACTIVE &&
        !existingServer.deletedAt
      ) {
        throw new ConflictException(ERROR_MESSAGES.SERVER.ALREADY_EXIST);
      }

      // Previously deleted -> restore it
      if (
        existingServer.status === EntityStatus.INACTIVE &&
        existingServer.deletedAt
      ) {
        const credential = await this.credentialRepository.findOne({
          where: {
            serverId: existingServer.id,
            status: EntityStatus.INACTIVE,
          },
        });

        if (!credential) {
          return {
            success: false,
            step: "SSH_TEST",
            error: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
            code: "CREDENTIALS_NOT_FOUND",
            logs: ["SSH credentials not found for deleted server"],
          };
        }

        const testTimeoutMs = 10_000;

        type SshTestResult = {
          success: boolean;
          latency: number;
          username: string | null;
          hostname: string | null;
          platform: string | null;
          message: string;
          code?: string;
        };

        const testPromise = this.validateServerConnection(
          existingServer,
          credential,
        );

        const result = (await Promise.race([
          testPromise,
          new Promise<SshTestResult>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: false,
                  latency: 0,
                  username: null,
                  hostname: null,
                  platform: null,
                  message: "Connection timed out",
                  code: "CONNECTION_TIMEOUT",
                }),
              testTimeoutMs,
            ),
          ),
        ])) as SshTestResult;

        if (!result.success) {
          this.sshManager.disconnect(existingServer.id);
          return {
            success: false,
            step: "SSH_TEST",
            error: result.message,
            code: result.code ?? this.mapTestErrorCode(result.message),
            logs: ["Deleted server found", "SSH validation failed"],
          };
        }

        const restoredCredential = await this.restoreServer(existingServer.id);

        if (!restoredCredential) {
          return {
            success: false,
            step: "SSH_TEST",
            error: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
            code: "CREDENTIALS_NOT_FOUND",
            logs: ["SSH ok but credentials missing after restore"],
          };
        }

        const restoreLogs: string[] = ["Deleted server restored"];
        const agentInstall = await this.runAgentInstallAfterOnboard({
          installAgent: input.installAgent,
          server: existingServer,
          credential: restoredCredential,
          logs: restoreLogs,
        });

        return {
          success: true,
          serverId: existingServer.id,
          sshCredentialId: restoredCredential.id,
          sshTest: { success: true },
          agentInstall,
          message: SUCCESS_MESSAGES.SERVER.CREATED,
        };
      }
    }

    const logs: string[] = [];
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const serverRepo = queryRunner.manager.getRepository(ServerEntity);
      const credentialRepo = queryRunner.manager.getRepository(
        ServerSshCredentialEntity,
      );

      // STEP 2: create server
      const serverPayload: CreateServerDto = input.server;
      const serverEntity = serverRepo.create({
        userId,
        name: serverPayload.name,
        host: serverPayload.host,
        port: serverPayload.port ?? DEFAULT_SSH_PORT,
        username: serverPayload.username,
        provider: serverPayload.provider ?? undefined,
        region: serverPayload.region ?? null,
        operatingSystem: serverPayload.operatingSystem ?? null,
        serverType: serverPayload.serverType ?? undefined,
        status: serverPayload.status ?? undefined,
        metadata: serverPayload.metadata ?? null,
      });

      const savedServer = await serverRepo.save(serverEntity);
      logs.push("Server created");

      // STEP 3: create SSH credentials (encrypt sensitive fields first)
      const ssh: CreateServerSshCredentialRequestDto | undefined = input.ssh;
      if (!ssh) throw new Error("ssh payload required");

      if (ssh.authType === ServerSshAuthType.PASSWORD && !ssh.password) {
        throw new Error("password required for PASSWORD authType");
      }
      if (ssh.authType === ServerSshAuthType.PRIVATE_KEY && !ssh.privateKey) {
        throw new Error("privateKey required for PRIVATE_KEY authType");
      }

      let encryptedPassword: string | null = null;
      let encryptedPrivateKey: string | null = null;
      let encryptedPassphrase: string | null = null;

      if (ssh.password) {
        encryptedPassword = this.encryptionService.encrypt(ssh.password);
      }
      if (ssh.privateKey) {
        encryptedPrivateKey = this.encryptionService.encrypt(ssh.privateKey);
      }
      if (ssh.privateKeyPassphrase) {
        encryptedPassphrase = this.encryptionService.encrypt(
          ssh.privateKeyPassphrase,
        );
      }

      const credEntity = credentialRepo.create({
        userId,
        serverId: savedServer.id,
        authType: ssh.authType,
        encryptedPrivateKey: encryptedPrivateKey ?? null,
        privateKeyPassphrase: encryptedPassphrase ?? null,
        encryptedPassword: encryptedPassword ?? null,
        sshFingerprint: ssh.sshFingerprint ?? null,
        status: undefined,
        metadata: undefined,
      });

      const savedCredential = await credentialRepo.save(credEntity);
      logs.push("SSH credentials created");

      const testTimeoutMs = 10_000;

      const testPromise = this.health.testConnection({
        serverId: savedServer.id,
        host: savedServer.host,
        port: savedServer.port,
        username: savedServer.username,
        authType: savedCredential.authType,
        encryptedPassword: savedCredential.encryptedPassword ?? null,
        encryptedPrivateKey: savedCredential.encryptedPrivateKey ?? null,
        privateKey: ssh.privateKey ?? undefined,
        privateKeyPassphrase: savedCredential.privateKeyPassphrase ?? null,
      });

      type SshTestResult = {
        success: boolean;
        latency: number;
        username: string | null;
        hostname: string | null;
        platform: string | null;
        message: string;
        code?: string;
      };

      const result = (await Promise.race([
        testPromise,
        new Promise<SshTestResult>((resolve) =>
          setTimeout(
            () =>
              resolve({
                success: false,
                latency: 0,
                username: null,
                hostname: null,
                platform: null,
                message: "Connection timed out",
                code: "CONNECTION_TIMEOUT",
              }),
            testTimeoutMs,
          ),
        ),
      ])) as SshTestResult;

      if (result && result.success) {
        await queryRunner.commitTransaction();
        logs.push("SSH connection successful");
        logs.push("Validation command executed");

        const agentInstall = await this.runAgentInstallAfterOnboard({
          installAgent: input.installAgent,
          server: savedServer,
          credential: savedCredential,
          plainPrivateKey: ssh.privateKey,
          logs,
        });

        return {
          success: true,
          serverId: savedServer.id,
          sshCredentialId: savedCredential.id,
          sshTest: { success: true },
          agentInstall,
          message: SUCCESS_MESSAGES.SERVER.CREATED,
        };
      }

      this.sshManager.disconnect(savedServer.id);
      await queryRunner.rollbackTransaction();
      logs.push("SSH test failed");
      logs.push("Transaction rolled back");

      const message =
        result && result.message ? result.message : "SSH test failed";
      const code =
        result && result.code ? result.code : this.mapTestErrorCode(message);

      return {
        success: false,
        step: "SSH_TEST",
        error: message,
        code,
        logs,
      };
    } catch (err) {
      try {
        await queryRunner.rollbackTransaction();
      } catch (rollbackErr) {
        console.warn("rollback failed:", (rollbackErr as Error).message);
      }
      logs.push("Transaction rolled back");
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        throw new ConflictException(
          "Server with this host and port already exists",
        );
      }
      return {
        success: false,
        step: "SSH_TEST",
        error: (err as Error).message,
        code: "UNKNOWN_ERROR",
        logs,
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Test connection
   * @param server
   * @param credential
   * @returns
   */
  private async validateServerConnection(
    server: ServerEntity,
    credential: ServerSshCredentialEntity,
  ) {
    return this.health.testConnection({
      serverId: server.id,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: credential.authType,
      encryptedPassword: credential.encryptedPassword ?? null,
      encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
      privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
    });
  }

  /**
   * connec with the server
   * @param id
   * @returns
   */
  async connectServer(id: string) {
    try {
      const serverOptions = await this.getServerConnectionOptions(id);

      const existing = this.sshManager.getConnection(id);

      if (existing) {
        throw new Error("Server already connected");
      }

      await this.sshManager.connect(serverOptions);

      return {
        success: true,
        connected: true,
        message: "Server connected successfully",
      };
    } catch (error) {
      console.log(error);
      return {
        success: false,
        connected: false,
        message:
          error instanceof Error ? error.message : "Failed to connect server",
      };
    }
  }

  /**
   * disconnect with the server
   * @param id
   * @returns
   */
  async disconnectServer(id: string) {
    try {
      await this.getServerConnectionOptions(id);
      this.sshManager.disconnect(id);
      return {
        success: true,
        connected: false,
        message: "Server disconnected successfully",
      };
    } catch (error) {
      return {
        success: false,
        connected: false,
        message:
          error instanceof Error ? error.message : "Failed to connect server",
      };
    }
  }

  /**
   * soft delete server
   * @param id
   * @returns
   */
  async deleteServer(id: string) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const serverRepo = queryRunner.manager.getRepository(ServerEntity);
      const credentialRepo = queryRunner.manager.getRepository(
        ServerSshCredentialEntity,
      );

      const server = await serverRepo.findOne({
        where: { id },
      });

      if (!server) {
        throw new Error("Server not found");
      }

      // Disconnect active SSH session
      if (this.sshManager.isConnected(id)) {
        this.sshManager.disconnect(id);
      }

      const currentTime = dayjs().unix();

      await serverRepo.update(
        { id },
        {
          status: EntityStatus.INACTIVE,
          deletedAt: currentTime,
        },
      );

      await credentialRepo.update(
        { serverId: id },
        {
          status: EntityStatus.INACTIVE,
          deletedAt: currentTime,
        },
      );

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Server deleted successfully",
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete server",
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * List servers
   * @returns
   */
  async list(): Promise<ServerEntity[]> {
    return await this.serverRepository.find({
      where: {
        status: EntityStatus.ACTIVE,
        deletedAt: IsNull(),
      },
      order: {
        createdAt: "DESC",
      },
    });
  }

  /**
   * Test connection
   * @param id
   * @returns
   */
  async test(id: string): Promise<unknown> {
    const server = await this.serverRepository.findOne({
      where: { id, status: EntityStatus.ACTIVE, deletedAt: IsNull() },
    });
    if (!server) return { success: false, message: "Server not found" };
    const creds = await this.credentialRepository.find({
      where: { serverId: id },
      order: { createdAt: "DESC" },
    });
    const credential = creds[0];
    if (!credential)
      return { success: false, message: "No credentials for server" };

    return this.health.testConnection({
      serverId: id,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: credential.authType,
      encryptedPassword: credential.encryptedPassword ?? null,
      encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
      privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
    });
  }

  /**
   * execute commands
   * @param id
   * @param body
   * @returns
   */
  async execute(
    id: string,
    body: ExecuteCommandDto,
  ): Promise<ExecuteResult | { success: false; message: string }> {
    const server = await this.serverRepository.findOne({
      where: { id, status: EntityStatus.ACTIVE, deletedAt: IsNull() },
    });
    if (!server) return { success: false, message: "Server not found" };
    const creds = await this.credentialRepository.find({
      where: { serverId: id },
      order: { createdAt: "DESC" },
    });
    const credential = creds[0];
    if (!credential)
      return { success: false, message: "No credentials for server" };

    const options = {
      serverId: id,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: credential.authType,
      encryptedPassword: credential.encryptedPassword ?? null,
      encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
      privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
    };

    await this.health.testConnection(options);

    const result = await this.executor.executeCommand(
      id,
      body.command,
      body.timeout,
    );
    return result;
  }

  private mapTestErrorCode(message: string | undefined): string {
    const msg = (message ?? "").toLowerCase();
    if (
      msg.includes("permission denied") ||
      msg.includes("authentication failed") ||
      msg.includes("auth")
    )
      return "AUTH_FAILED";
    if (msg.includes("timed out") || msg.includes("timeout"))
      return "CONNECTION_TIMEOUT";
    if (
      msg.includes("getaddrinfo") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("host") ||
      msg.includes("unreachable")
    )
      return "HOST_UNREACHABLE";
    return "UNKNOWN_ERROR";
  }

  /**
   * find one
   * @param options
   * @returns
   */
  async findOne(options: FindOneOptions<ServerEntity>) {
    return await this.serverRepository.findOne(options);
  }
}
