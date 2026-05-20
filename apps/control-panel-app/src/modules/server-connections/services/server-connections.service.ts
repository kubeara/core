import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    CreateServerDto,
    CreateServerSshCredentialDto,
    ServerResponseDto,
    ServerSshCredentialResponseDto,
    CreateServerWithCredentialsRequestDto,
} from '../dto';
import { ServerSshCredentialEntity } from '../entities/server-ssh-credential.entity';
import { ServerEntity } from '../entities/server.entity';
import { EncryptionService } from '@shared/common';
import { ServerSshAuthType } from '../enums/server-ssh-auth-type.enum';
import { SshHealthCheckService, SshCommandExecutorService } from '@shared/ssh';
import { DEFAULT_SSH_PORT } from '../server-connections.constants';

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
    ) { }

    async createServer(input: CreateServerDto): Promise<ServerResponseDto> {
        const entity = this.serverRepository.create({
            name: input.name,
            host: input.host,
            port: input.port ?? DEFAULT_SSH_PORT,
            provider: input.provider ?? undefined,
            region: input.region ?? null,
            operatingSystem: input.operatingSystem ?? null,
            serverType: input.serverType ?? undefined,
            status: input.status,
            metadata: input.metadata ?? null,
        } as any);

        const saved = await this.serverRepository.save(entity) as unknown as ServerEntity;
        return toServerResponse(saved as ServerEntity);
    }

    /**
     * Create a server and optionally attach SSH credentials within a single
     * database transaction. Sensitive fields are encrypted before persisting.
     */
    async createServerWithCredentials(input: CreateServerWithCredentialsRequestDto): Promise<any> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const serverRepo = queryRunner.manager.getRepository(ServerEntity);
            const credentialRepo = queryRunner.manager.getRepository(ServerSshCredentialEntity);

            // Prepare and save server
            const serverEntity = serverRepo.create({
                name: input.name,
                host: input.host,
                port: input.port,
                provider: input.provider,
                region: input.region ?? null,
                operatingSystem: input.operatingSystem ?? null,
                serverType: input.serverType,
                status: input.status,
                metadata: input.metadata ?? null,
            } as any);

            const savedServer = await serverRepo.save(serverEntity) as unknown as ServerEntity;

            let savedCredential: ServerSshCredentialEntity | null = null;

            if (input.credentials) {
                const c = input.credentials;

                // Business rule validation (extra safety beyond DTO validators)
                if (!c.username) throw new Error('username required for credentials');
                if (c.authType === ServerSshAuthType.PASSWORD && !c.password) {
                    throw new Error('password required for authType PASSWORD');
                }
                if (c.authType === ServerSshAuthType.PRIVATE_KEY && !c.privateKey) {
                    throw new Error('privateKey required for authType PRIVATE_KEY');
                }

                // Encrypt sensitive fields before saving
                let encryptedPassword: string | null = null;
                let encryptedPrivateKey: string | null = null;
                let encryptedPassphrase: string | null = null;

                if (c.password) {
                    encryptedPassword = this.encryptionService.encrypt(c.password);
                }

                if (c.privateKey) {
                    encryptedPrivateKey = this.encryptionService.encrypt(c.privateKey);
                }

                if (c.privateKeyPassphrase) {
                    encryptedPassphrase = this.encryptionService.encrypt(c.privateKeyPassphrase);
                }

                const credEntity = credentialRepo.create({
                    serverId: savedServer.id,
                    authType: c.authType,
                    username: c.username,
                    encryptedPrivateKey: encryptedPrivateKey ?? null,
                    privateKeyPassphrase: encryptedPassphrase ?? null,
                    encryptedPassword: encryptedPassword ?? null,
                    sshFingerprint: (c as any).sshFingerprint ?? null,
                    status: undefined,
                    metadata: undefined,
                } as any);

                savedCredential = await credentialRepo.save(credEntity) as unknown as ServerSshCredentialEntity;
            }

            await queryRunner.commitTransaction();

            const response: any = {
                server: { id: savedServer.id, name: savedServer.name, host: savedServer.host },
            };

            if (savedCredential) {
                response.credentials = { id: (savedCredential as ServerSshCredentialEntity).id, authType: (savedCredential as ServerSshCredentialEntity).authType, username: (savedCredential as ServerSshCredentialEntity).username };
            }

            return response;
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Onboard server: create server + credentials and validate SSH connection
     * Atomically: if SSH test fails the transaction is rolled back and nothing is persisted
     */
    async onboardServer(input: any): Promise<any> {
        const logs: string[] = [];
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const serverRepo = queryRunner.manager.getRepository(ServerEntity);
            const credentialRepo = queryRunner.manager.getRepository(ServerSshCredentialEntity);

            // STEP 2: create server
            const serverPayload = input.server as any;
            const serverEntity = serverRepo.create({
                name: serverPayload.name,
                host: serverPayload.host,
                port: serverPayload.port ?? DEFAULT_SSH_PORT,
                provider: serverPayload.provider ?? undefined,
                region: serverPayload.region ?? null,
                operatingSystem: serverPayload.operatingSystem ?? null,
                serverType: serverPayload.serverType ?? undefined,
                status: serverPayload.status ?? undefined,
                metadata: serverPayload.metadata ?? null,
            } as any);

            const savedServer = await serverRepo.save(serverEntity) as unknown as ServerEntity;
            logs.push('Server created');

            // STEP 3: create SSH credentials (encrypt sensitive fields first)
            const ssh = input.ssh as any;
            if (!ssh) throw new Error('ssh payload required');

            // Debug: show full incoming ssh payload (for debugging only — avoid in production)
            console.log('ONBOARD SSH PAYLOAD:', { authType: ssh.authType, username: ssh.username, hasPrivateKey: !!ssh.privateKey, hasEncryptedPrivateKey: !!ssh.encryptedPrivateKey });
            console.log('FULL SSH PAYLOAD:', ssh);

            if (!ssh.username) throw new Error('username required for ssh credentials');
            if (ssh.authType === 'PASSWORD' && !ssh.password) throw new Error('password required for PASSWORD authType');
            if (ssh.authType === 'PRIVATE_KEY' && !ssh.privateKey) throw new Error('privateKey required for PRIVATE_KEY authType');

            let encryptedPassword: string | null = null;
            let encryptedPrivateKey: string | null = null;
            let encryptedPassphrase: string | null = null;

            if (ssh.password) encryptedPassword = this.encryptionService.encrypt(ssh.password);
            if (ssh.privateKey) encryptedPrivateKey = this.encryptionService.encrypt(ssh.privateKey);
            if (ssh.passphrase) encryptedPassphrase = this.encryptionService.encrypt(ssh.passphrase);

            const credEntity = credentialRepo.create({
                serverId: savedServer.id,
                authType: ssh.authType,
                username: ssh.username,
                encryptedPrivateKey: encryptedPrivateKey ?? null,
                privateKeyPassphrase: encryptedPassphrase ?? null,
                encryptedPassword: encryptedPassword ?? null,
                sshFingerprint: (ssh as any).sshFingerprint ?? null,
                status: undefined,
                metadata: undefined,
            } as any);

            const savedCredential = await credentialRepo.save(credEntity) as unknown as ServerSshCredentialEntity;
            logs.push('SSH credentials created');

            // STEP 4: test SSH connection with timeout of 10s using health.testConnection
            const testTimeoutMs = 10_000;

            const testPromise = this.health.testConnection({
                serverId: savedServer.id,
                host: savedServer.host,
                port: savedServer.port,
                username: savedCredential.username,
                authType: savedCredential.authType as any,
                encryptedPassword: savedCredential.encryptedPassword ?? null,
                encryptedPrivateKey: savedCredential.encryptedPrivateKey ?? null,
                // If an incoming raw privateKey was provided during onboarding, pass it through
                // so that the connection manager receives the full secret directly.
                privateKey: ssh.privateKey ?? undefined,
                privateKeyPassphrase: savedCredential.privateKeyPassphrase ?? null,
            } as any);

            const result = await Promise.race([
                testPromise,
                new Promise(resolve => setTimeout(() => resolve({ success: false, message: 'Connection timed out', code: 'CONNECTION_TIMEOUT' }), testTimeoutMs)),
            ]) as any;

            if (result && result.success) {
                // commit transaction
                await queryRunner.commitTransaction();
                logs.push('SSH connection successful');
                logs.push('Validation command executed');

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
            logs.push('SSH test failed');
            logs.push('Transaction rolled back');

            const message = (result && result.message) ? result.message : 'SSH test failed';
            const code = (result && result.code) ? result.code : this.mapTestErrorCode(message);

            return {
                success: false,
                step: 'SSH_TEST',
                error: message,
                code,
                logs,
            };
        } catch (err) {
            try { await queryRunner.rollbackTransaction(); } catch { }
            logs.push('Transaction rolled back');
            return {
                success: false,
                step: 'SSH_TEST',
                error: (err as Error).message,
                code: 'UNKNOWN_ERROR',
                logs,
            };
        } finally {
            await queryRunner.release();
        }
    }

    async createSshCredential(input: CreateServerSshCredentialDto): Promise<ServerSshCredentialResponseDto> {
        const entity = this.credentialRepository.create({
            serverId: input.serverId,
            authType: input.authType,
            username: input.username,
            encryptedPrivateKey: input.encryptedPrivateKey ?? null,
            privateKeyPassphrase: input.privateKeyPassphrase ?? null,
            encryptedPassword: input.encryptedPassword ?? null,
            sshFingerprint: input.sshFingerprint ?? null,
            status: input.status,
            metadata: input.metadata ?? null,
        } as any);

        const saved = await this.credentialRepository.save(entity) as unknown as ServerSshCredentialEntity;
        return toCredentialResponse(saved as ServerSshCredentialEntity);
    }

    async findServerCredentials(serverId: string): Promise<ServerSshCredentialResponseDto[]> {
        const credentials = await this.credentialRepository.find({ where: { serverId }, order: { createdAt: 'DESC' } });
        return credentials.map(toCredentialResponse);
    }

    // Controller-facing helpers moved into service so controllers remain thin
    async list(): Promise<ServerEntity[]> {
        return this.serverRepository.find({ where: {}, order: { createdAt: 'DESC' } });
    }

    async get(id: string): Promise<ServerEntity | null> {
        return this.serverRepository.findOne({ where: { id } });
    }

    async patch(id: string, patch: Partial<ServerEntity>): Promise<ServerEntity> {
        const entity = await this.serverRepository.findOne({ where: { id } });
        if (!entity) throw new Error('Server not found');
        Object.assign(entity, patch as any);
        return this.serverRepository.save(entity);
    }

    async remove(id: string): Promise<void> {
        await this.serverRepository.softDelete({ id } as any);
    }

    async test(id: string): Promise<any> {
        const server = await this.serverRepository.findOne({ where: { id } });
        if (!server) return { success: false, message: 'Server not found' };
        const creds = await this.credentialRepository.find({ where: { serverId: id }, order: { createdAt: 'DESC' } });
        const credential = creds[0];
        if (!credential) return { success: false, message: 'No credentials for server' };

        return this.health.testConnection({
            serverId: id,
            host: server.host,
            port: server.port,
            username: credential.username,
            authType: credential.authType as any,
            encryptedPassword: credential.encryptedPassword ?? null,
            encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
            privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
        } as any);
    }

    async addCredentials(id: string, body: any): Promise<any> {
        // Encrypt sensitive fields
        let encryptedPassword: string | null = null;
        let encryptedPrivateKey: string | null = null;
        let encryptedPrivateKeyPassphrase: string | null = null;

        try {
            if (body.authType === 'PASSWORD' && body.password) {
                encryptedPassword = this.encryptionService.encrypt(body.password);
            }

            if (body.authType === 'PRIVATE_KEY' && body.privateKey) {
                encryptedPrivateKey = this.encryptionService.encrypt(body.privateKey);
            }

            if (body.privateKeyPassphrase) {
                encryptedPrivateKeyPassphrase = this.encryptionService.encrypt(body.privateKeyPassphrase);
            }
        } catch (err) {
            return { success: false, message: 'Encryption failed', error: (err as Error).message };
        }

        const server = await this.serverRepository.findOne({ where: { id } });
        if (!server) return { success: false, message: 'Server not found' };

        const existing = await this.credentialRepository.find({ where: { serverId: id }, order: { createdAt: 'DESC' } });
        let saved: any;
        const input: any = {
            serverId: id,
            authType: body.authType,
            username: body.username,
            encryptedPrivateKey: encryptedPrivateKey ?? undefined,
            privateKeyPassphrase: encryptedPrivateKeyPassphrase ?? undefined,
            encryptedPassword: encryptedPassword ?? undefined,
            sshFingerprint: undefined,
            status: undefined,
            metadata: undefined,
        };

        if (existing && existing.length > 0) {
            const toUpdate: any = {
                authType: input.authType,
                username: input.username,
                encryptedPrivateKey: input.encryptedPrivateKey,
                privateKeyPassphrase: input.privateKeyPassphrase,
                encryptedPassword: input.encryptedPassword,
            };
            const entity = existing[0];
            Object.assign(entity, toUpdate);
            saved = await this.credentialRepository.save(entity);
        } else {
            const entity = this.credentialRepository.create(input as any);
            saved = await this.credentialRepository.save(entity);
        }

        // Test SSH connection
        try {
            const result = await this.health.testConnection({
                serverId: id,
                host: server.host,
                port: server.port,
                username: body.username,
                authType: body.authType as any,
                encryptedPassword: encryptedPassword,
                encryptedPrivateKey: encryptedPrivateKey,
                // forward raw privateKey if provided so manager can use it immediately
                privateKey: body.privateKey ?? undefined,
                privateKeyPassphrase: encryptedPrivateKeyPassphrase,
            } as any);

            if (result.success) {
                return {
                    success: true,
                    message: 'SSH connection established successfully',
                    serverId: id,
                    authType: body.authType,
                    connectionTest: {
                        latency: result.latency,
                        platform: result.platform,
                    },
                };
            }

            return { success: false, message: 'SSH authentication failed', error: result.message };
        } catch (err) {
            return { success: false, message: 'SSH authentication failed', error: (err as Error).message };
        }
    }

    async execute(id: string, body: any): Promise<any> {
        const server = await this.serverRepository.findOne({ where: { id } });
        if (!server) return { success: false, message: 'Server not found' };
        const creds = await this.credentialRepository.find({ where: { serverId: id }, order: { createdAt: 'DESC' } });
        const credential = creds[0];
        if (!credential) return { success: false, message: 'No credentials for server' };

        const options = {
            serverId: id,
            host: server.host,
            port: server.port,
            username: credential.username,
            authType: credential.authType as any,
            encryptedPassword: credential.encryptedPassword ?? null,
            encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
            privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
        } as any;

        await this.health.testConnection(options);

        const result = await this.executor.executeCommand(id, body.command, body.timeout);
        return result;
    }

    // Map textual error to one of the UI codes
    private mapTestErrorCode(message: string | undefined): string {
        const msg = (message ?? '').toLowerCase();
        if (msg.includes('permission denied') || msg.includes('authentication failed') || msg.includes('auth')) return 'AUTH_FAILED';
        if (msg.includes('timed out') || msg.includes('timeout')) return 'CONNECTION_TIMEOUT';
        if (msg.includes('getaddrinfo') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('host') || msg.includes('unreachable')) return 'HOST_UNREACHABLE';
        return 'UNKNOWN_ERROR';
    }
}

function toServerResponse(entity: ServerEntity): ServerResponseDto {
    return {
        id: entity.id,
        status: entity.status,
        metadata: entity.metadata,
        name: entity.name,
        host: entity.host,
        port: entity.port,
        provider: entity.provider,
        region: entity.region,
        operatingSystem: entity.operatingSystem,
        serverType: entity.serverType,
        lastConnectedAt: entity.lastConnectedAt,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        deletedAt: entity.deletedAt,
    };
}

function toCredentialResponse(entity: ServerSshCredentialEntity): ServerSshCredentialResponseDto {
    return {
        id: entity.id,
        serverId: entity.serverId,
        status: entity.status,
        metadata: entity.metadata,
        authType: entity.authType,
        username: entity.username,
        sshFingerprint: entity.sshFingerprint,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        deletedAt: entity.deletedAt,
    };
}


