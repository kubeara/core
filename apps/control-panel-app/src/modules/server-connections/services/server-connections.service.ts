import { ConflictException, Injectable } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
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
} from "@shared/ssh";
import { DEFAULT_SSH_PORT } from "../server-connections.constants";

export interface ExistingServerCheck {
  host: string;
  username: string;
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
  ) {}

  async assertServerNotDuplicate(input: ExistingServerCheck): Promise<void> {
    const exists = await this.serverRepository.findOne({
      where: { host: input.host, username: input.username },
    });
    if (exists) {
      throw new ConflictException(
        "Server with this host and username already exists",
      );
    }
  }

  /**
   * Onboard server: create server + credentials and validate SSH connection
   * Atomically: if SSH test fails the transaction is rolled back and nothing is persisted
   */
  async onboardServer(
    input: CreateServerOnboardRequestDto,
  ): Promise<OnboardResponseDto> {
    await this.assertServerNotDuplicate({
      host: input.server.host,
      username: input.server.username
    });

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

      // Debug: show full incoming ssh payload (for debugging only — avoid in production)
      console.log("ONBOARD SSH PAYLOAD:", {
        authType: ssh.authType,
        hasPrivateKey: !!ssh.privateKey,
      });
      console.log("FULL SSH PAYLOAD:", ssh);

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
        // commit transaction
        await queryRunner.commitTransaction();
        logs.push("SSH connection successful");
        logs.push("Validation command executed");

        return {
          success: true,
          serverId: savedServer.id,
          sshCredentialId: savedCredential.id,
          sshTest: { success: true },
          logs,
        };
      }

      // if we reach here, test failed
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

  // Controller-facing helpers moved into service so controllers remain thin
  async list(): Promise<ServerEntity[]> {
    return this.serverRepository.find({
      where: {},
      order: { createdAt: "DESC" },
    });
  }

  async get(id: string): Promise<ServerEntity | null> {
    return this.serverRepository.findOne({ where: { id } });
  }

  async patch(id: string, patch: Partial<ServerEntity>): Promise<ServerEntity> {
    const entity = await this.serverRepository.findOne({ where: { id } });
    if (!entity) throw new Error("Server not found");
    Object.assign(entity, patch);
    return this.serverRepository.save(entity);
  }

  async remove(id: string): Promise<void> {
    await this.serverRepository.softDelete({ id });
  }

  async test(id: string): Promise<unknown> {
    const server = await this.serverRepository.findOne({ where: { id } });
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

  async execute(
    id: string,
    body: ExecuteCommandDto,
  ): Promise<ExecuteResult | { success: false; message: string }> {
    const server = await this.serverRepository.findOne({ where: { id } });
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

  // Map textual error to one of the UI codes
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
}
