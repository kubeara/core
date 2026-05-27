import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DataSource,
  FindOneOptions,
  Repository,
  IsNull,
  FindOptionsWhere,
  In,
  Not,
  ILike,
} from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
  CreateServerDto,
  CreateServerSshCredentialRequestDto,
  CreateServerOnboardRequestDto,
  OnboardSuccessData,
  ListServersQueryDto,
  UpdateServerDto,
  ServerResponseDto,
} from "../dto";
import { ServerSshCredentialEntity } from "../entities/server-ssh-credential.entity";
import { ServerEntity } from "../entities/server.entity";
import { EncryptionService } from "@shared/common";
import {
  SshHealthCheckService,
  SshCommandExecutorService,
  ExecuteCommandDto,
  ExecuteResult,
  SshConnectionManager,
  SshConnectionOptions,
} from "@shared/ssh";
import { AgentInstallResult } from "./agent-install.service";
import { AgentInstallService } from "./agent-install.service";
import { RemoteAgentInstallService } from "./remote-agent-install.service";
import { ServerType } from "../enums/server-type.enum";
import {
  DEFAULT_SSH_PORT,
  ONBOARD_SSH_TEST_SERVER_ID,
} from "../server-connections.constants";
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_LIST_PAGE,
  DEFAULT_LIST_SORT_BY,
  DEFAULT_LIST_SORT_ORDER,
} from "../constants/server-onboard.constants";
import { SERVER_ONBOARD_LOGS } from "../constants/server-onboard-messages.constants";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import dayjs from "dayjs";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { PaginatedResponse } from "@shared/common";
import { toServerResponseDto } from "../utils/server.mapper";
import { OperationFailedException } from "@control-panel/common/exceptions/operation-failed.exception";
import { ExistingServerCheck } from "../interfaces/existing-server-check.interface";
import { OnboardFailureParams } from "../interfaces/onboard-failure-params.interface";
import { RunAgentInstallAfterOnboardParams } from "../interfaces/run-agent-install-after-onboard-params.interface";
import { ServerErrorCode } from "../enums/server-error-code.enum";
import { mapSshTestErrorCode } from "../utils/map-ssh-test-error-code.util";
import { runSshHealthTestWithTimeout } from "../utils/run-ssh-health-test.util";
import {
  assertOnboardSshInput,
  buildOnboardServerConnectionInfo,
  buildOnboardSshTestOptions,
  encryptCredentialFields,
  OnboardSshServerInfo,
} from "../utils/server-ssh-credential.util";

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
    private readonly agentInstall: AgentInstallService,
  ) {}

  /**
   * Installs (or refreshes) the agent on the target host when it is not connected.
   * Local servers use the same prerequisite + docker-compose flow as remote SSH onboard.
   */
  async ensureAgentInstalledForServer(
    serverId: string,
    options?: { plainPrivateKey?: string },
  ): Promise<AgentInstallResult> {
    const server = await this.serverRepository.findOne({
      where: { id: serverId, status: EntityStatus.ACTIVE, deletedAt: IsNull() },
    });

    if (!server) {
      return {
        success: false,
        logs: [],
        error: ERROR_MESSAGES.SERVER.INACTIVE_OR_MISSING,
      };
    }

    if (server.serverType === ServerType.LOCAL) {
      return this.agentInstall.installOnLocal({ serverId });
    }

    const credential = await this.credentialRepository.findOne({
      where: { serverId, status: EntityStatus.ACTIVE, deletedAt: IsNull() },
    });

    if (!credential) {
      return {
        success: false,
        logs: [],
        error: ERROR_MESSAGES.SERVER.AGENT_CREDENTIALS_MISSING,
      };
    }

    return this.remoteAgentInstall.install({
      connection: this.buildSshOptions(
        server,
        credential,
        options?.plainPrivateKey,
      ),
      serverHost: server.host,
      plainPrivateKey: options?.plainPrivateKey,
    });
  }

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

  private async runAgentInstallAfterOnboard(
    params: RunAgentInstallAfterOnboardParams,
  ): Promise<AgentInstallResult> {
    if (!this.shouldInstallAgent(params.installAgent)) {
      this.sshManager.disconnect(params.server.id);
      return {
        success: true,
        logs: [SERVER_ONBOARD_LOGS.AGENT_INSTALL_SKIPPED],
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

  private async getOwnedServer(
    userId: string,
    id: string,
  ): Promise<ServerEntity> {
    const server = await this.serverRepository.findOne({
      where: {
        id,
        userId,
        status: EntityStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });

    if (!server) {
      throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
    }

    return server;
  }

  private async getServerConnectionOptions(userId: string, id: string) {
    const server = await this.getOwnedServer(userId, id);

    const credential = await this.credentialRepository.findOne({
      where: { serverId: id },
    });

    if (!credential) {
      throw new NotFoundException(ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND);
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

  private async updateInactiveCredentialFromInput(
    credentialId: string,
    ssh: CreateServerSshCredentialRequestDto,
  ): Promise<void> {
    const encrypted = encryptCredentialFields(this.encryptionService, ssh);

    await this.credentialRepository.update(
      { id: credentialId },
      {
        authType: ssh.authType,
        encryptedPassword: encrypted.encryptedPassword,
        encryptedPrivateKey: encrypted.encryptedPrivateKey,
        privateKeyPassphrase: encrypted.encryptedPassphrase,
        sshFingerprint: ssh.sshFingerprint ?? null,
      },
    );
  }

  private throwOnboardFailure(params: OnboardFailureParams): never {
    throw new OperationFailedException(
      params.message,
      params.error,
      HttpStatus.BAD_REQUEST,
      { errorCode: params.code },
    );
  }

  private async assertOnboardSshConnection(
    server: OnboardSshServerInfo,
    ssh: CreateServerSshCredentialRequestDto,
    options?: { releaseConnectionAfterSuccess?: boolean },
  ): Promise<void> {
    const result = await runSshHealthTestWithTimeout(
      this.health,
      buildOnboardSshTestOptions(this.encryptionService, server, ssh),
    );

    if (!result.success) {
      this.sshManager.disconnect(server.id);
      this.throwOnboardFailure({
        message: ERROR_MESSAGES.SERVER.SSH_CONNECTION_FAILED,
        error: result.message || ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
        code: result.code ?? mapSshTestErrorCode(result.message),
      });
    }

    if (options?.releaseConnectionAfterSuccess) {
      this.sshManager.disconnect(server.id);
    }
  }

  private requireOnboardSshPayload(
    ssh: CreateServerSshCredentialRequestDto | undefined,
  ): CreateServerSshCredentialRequestDto {
    if (!ssh) {
      throw new BadRequestException(ERROR_MESSAGES.SERVER.SSH_PAYLOAD_REQUIRED);
    }

    return ssh;
  }

  private async restoreDeletedServer(
    existingServer: ServerEntity,
    input: CreateServerOnboardRequestDto,
  ): Promise<ServiceResponse<OnboardSuccessData>> {
    const credential = await this.credentialRepository.findOne({
      where: {
        serverId: existingServer.id,
        status: EntityStatus.INACTIVE,
      },
    });

    if (!credential) {
      this.throwOnboardFailure({
        message: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        error: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        code: ServerErrorCode.CREDENTIALS_NOT_FOUND,
      });
    }

    const ssh = this.requireOnboardSshPayload(input.ssh);
    assertOnboardSshInput(ssh);

    await this.assertOnboardSshConnection(existingServer, ssh);

    await this.updateInactiveCredentialFromInput(credential.id, ssh);

    const restoredCredential = await this.restoreServer(existingServer.id);

    if (!restoredCredential) {
      this.throwOnboardFailure({
        message: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        error: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        code: ServerErrorCode.CREDENTIALS_NOT_FOUND,
      });
    }

    const restoreLogs: string[] = [SERVER_ONBOARD_LOGS.DELETED_SERVER_RESTORED];
    const agentInstall = await this.runAgentInstallAfterOnboard({
      installAgent: input.installAgent,
      server: existingServer,
      credential: restoredCredential,
      plainPrivateKey: ssh.privateKey,
      logs: restoreLogs,
    });

    return {
      message: SUCCESS_MESSAGES.SERVER.RESTORED,
      data: {
        serverId: existingServer.id,
        sshCredentialId: restoredCredential.id,
        sshTest: { success: true },
        agentInstall,
      },
    };
  }

  /**
   * create the server
   * @param input
   * @returns
   */
  async onboardServer(
    userId: string,
    input: CreateServerOnboardRequestDto,
  ): Promise<ServiceResponse<OnboardSuccessData>> {
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
        return this.restoreDeletedServer(existingServer, input);
      }
    }

    const logs: string[] = [];

    const ssh = this.requireOnboardSshPayload(input.ssh);
    assertOnboardSshInput(ssh);

    await this.assertOnboardSshConnection(
      buildOnboardServerConnectionInfo(
        input.server,
        ONBOARD_SSH_TEST_SERVER_ID,
      ),
      ssh,
      { releaseConnectionAfterSuccess: true },
    );

    logs.push(SERVER_ONBOARD_LOGS.SSH_CONNECTION_SUCCESS);
    logs.push(SERVER_ONBOARD_LOGS.VALIDATION_EXECUTED);

    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const serverRepo = queryRunner.manager.getRepository(ServerEntity);

      const credentialRepo = queryRunner.manager.getRepository(
        ServerSshCredentialEntity,
      );

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

      logs.push(SERVER_ONBOARD_LOGS.SERVER_CREATED);

      const { encryptedPassword, encryptedPrivateKey, encryptedPassphrase } =
        encryptCredentialFields(this.encryptionService, ssh);

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

      logs.push(SERVER_ONBOARD_LOGS.SSH_CREDENTIALS_CREATED);

      await queryRunner.commitTransaction();

      const agentInstall = await this.runAgentInstallAfterOnboard({
        installAgent: input.installAgent,
        server: savedServer,
        credential: savedCredential,
        plainPrivateKey: ssh.privateKey,
        logs,
      });

      return {
        message: SUCCESS_MESSAGES.SERVER.CREATED,
        data: {
          serverId: savedServer.id,
          sshCredentialId: savedCredential.id,
          sshTest: { success: true },
          agentInstall,
        },
      };
    } catch (err) {
      try {
        await queryRunner.rollbackTransaction();
      } catch (rollbackErr) {
        console.warn("rollback failed:", (rollbackErr as Error).message);
      }

      logs.push(SERVER_ONBOARD_LOGS.TRANSACTION_ROLLED_BACK);

      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        throw new ConflictException(ERROR_MESSAGES.SERVER.HOST_ALREADY_EXISTS);
      }

      if (err instanceof HttpException) {
        throw err;
      }

      throw new OperationFailedException(
        err instanceof Error
          ? err.message
          : ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
        err instanceof Error
          ? err.message
          : ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
        HttpStatus.BAD_REQUEST,
        { errorCode: ServerErrorCode.UNKNOWN_ERROR },
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * connec with the server
   * @param id
   * @returns
   */
  async connectServer(
    userId: string,
    id: string,
  ): Promise<ServiceResponse<{ connected: boolean }>> {
    const serverOptions = await this.getServerConnectionOptions(userId, id);

    if (this.sshManager.getConnection(id)) {
      throw new OperationFailedException(
        ERROR_MESSAGES.SERVER.ALREADY_CONNECTED,
        ERROR_MESSAGES.SERVER.ALREADY_CONNECTED,
        HttpStatus.CONFLICT,
        { errorCode: ServerErrorCode.ALREADY_CONNECTED },
      );
    }

    try {
      await this.sshManager.connect(serverOptions);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new OperationFailedException(
        ERROR_MESSAGES.SERVER.CONNECTION_FAILED,
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.SERVER.CONNECTION_FAILED,
        HttpStatus.BAD_REQUEST,
        { errorCode: ServerErrorCode.CONNECTION_FAILED },
      );
    }

    await this.serverRepository.update(
      { id },
      { lastConnectedAt: dayjs().unix() },
    );

    return {
      message: SUCCESS_MESSAGES.SERVER.CONNECTED,
      data: { connected: true },
    };
  }

  /**
   * disconnect with the server
   * @param id
   * @returns
   */
  async disconnectServer(
    userId: string,
    id: string,
  ): Promise<ServiceResponse<{ connected: boolean }>> {
    await this.getServerConnectionOptions(userId, id);
    this.sshManager.disconnect(id);

    return {
      message: SUCCESS_MESSAGES.SERVER.DISCONNECTED,
      data: { connected: false },
    };
  }

  /**
   * soft delete server
   * @param id
   * @returns
   */
  async deleteServer(
    userId: string,
    id: string,
  ): Promise<ServiceResponse<{ deleted: true }>> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const serverRepo = queryRunner.manager.getRepository(ServerEntity);
      const credentialRepo = queryRunner.manager.getRepository(
        ServerSshCredentialEntity,
      );

      const server = await serverRepo.findOne({
        where: { id, userId, deletedAt: IsNull() },
      });

      if (!server) {
        throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
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
        message: SUCCESS_MESSAGES.SERVER.DELETED,
        data: { deleted: true as const },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof HttpException) {
        throw error;
      }

      throw new OperationFailedException(
        ERROR_MESSAGES.SERVER.DELETE_FAILED,
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.SERVER.DELETE_FAILED,
        HttpStatus.BAD_REQUEST,
        { errorCode: ServerErrorCode.DELETE_FAILED },
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * List servers with pagination, filtering, and search.
   */
  async listServers(
    userId: string,
    query: ListServersQueryDto,
  ): Promise<ServiceResponse<PaginatedResponse<ServerResponseDto>>> {
    const page = query.page ?? DEFAULT_LIST_PAGE;
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? DEFAULT_LIST_SORT_BY;
    const sortOrder = (
      query.sortOrder ?? DEFAULT_LIST_SORT_ORDER
    ).toUpperCase() as "ASC" | "DESC";

    const connectedIds = this.sshManager.getConnectedServerIds();

    const where: FindOptionsWhere<ServerEntity> = {
      userId,
      deletedAt: IsNull(),
      status: query.status ?? EntityStatus.ACTIVE,
    };

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.serverType) {
      where.serverType = query.serverType;
    }

    if (query.connected === true) {
      if (connectedIds.length === 0) {
        return {
          message: SUCCESS_MESSAGES.SERVER.LIST,
          data: {
            data: [],
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
            },
          },
        };
      }

      where.id = In(connectedIds);
    }

    if (query.connected === false && connectedIds.length > 0) {
      where.id = Not(In(connectedIds));
    }

    let searchWhere: FindOptionsWhere<ServerEntity>[] | undefined;

    if (query.search) {
      const search = ILike(`%${query.search}%`);

      searchWhere = [
        {
          ...where,
          name: search,
        },
        {
          ...where,
          host: search,
        },
        {
          ...where,
          username: search,
        },
      ];

      const searchId = String(query.search);

      if (!Number.isNaN(searchId)) {
        searchWhere.push({
          ...where,
          id: searchId,
        });
      }
    }

    const [servers, total] = await this.serverRepository.findAndCount({
      where: searchWhere ?? where,
      order: {
        [sortBy]: sortOrder,
      },
      skip,
      take: limit,
    });

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      message: SUCCESS_MESSAGES.SERVER.LIST,
      data: {
        data: servers.map((server) =>
          toServerResponseDto(server, this.sshManager),
        ),
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    };
  }

  /**
   * Get a single server owned by the authenticated user.
   */
  async getServerById(
    userId: string,
    id: string,
  ): Promise<ServiceResponse<ServerResponseDto>> {
    const server = await this.getOwnedServer(userId, id);

    return {
      message: SUCCESS_MESSAGES.SERVER.FETCHED,
      data: toServerResponseDto(server, this.sshManager),
    };
  }

  /**
   * Update server name for the authenticated user.
   */
  async updateServer(
    userId: string,
    id: string,
    input: UpdateServerDto,
  ): Promise<ServiceResponse<ServerResponseDto>> {
    const server = await this.getOwnedServer(userId, id);

    await this.serverRepository.update({ id: server.id }, { name: input.name });

    return {
      message: SUCCESS_MESSAGES.SERVER.UPDATED,
      data: toServerResponseDto(server, this.sshManager),
    };
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
    if (!server) {
      return { success: false, message: ERROR_MESSAGES.SERVER.NOT_FOUND };
    }
    const creds = await this.credentialRepository.find({
      where: { serverId: id },
      order: { createdAt: "DESC" },
    });
    const credential = creds[0];
    if (!credential) {
      return {
        success: false,
        message: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
      };
    }

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
    if (!server) {
      return { success: false, message: ERROR_MESSAGES.SERVER.NOT_FOUND };
    }
    const creds = await this.credentialRepository.find({
      where: { serverId: id },
      order: { createdAt: "DESC" },
    });
    const credential = creds[0];
    if (!credential) {
      return {
        success: false,
        message: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
      };
    }

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

  /**
   * find one
   * @param options
   * @returns
   */
  async findOne(options: FindOneOptions<ServerEntity>) {
    return await this.serverRepository.findOne(options);
  }
}
