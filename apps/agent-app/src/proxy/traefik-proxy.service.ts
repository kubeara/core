import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class TraefikProxyService {
    private readonly logger = new Logger(TraefikProxyService.name);
    private readonly projectName = 'kubeara-proxy';

    constructor(private readonly configService: ConfigService) {}

    isEnabled(): boolean {
        return this.configService.get<string>('TRAEFIK_ENABLED', 'false') === 'true';
    }

    isHttpsEnabled(): boolean {
        return this.configService.get<string>('TRAEFIK_HTTPS', 'false') === 'true';
    }

    isForceHttps(): boolean {
        return this.configService.get<string>('TRAEFIK_FORCE_HTTPS', 'false') === 'true';
    }

    getProxyComposePath(): string {
        return path.join(process.cwd(), 'apps/agent-app/proxy/docker-compose.yml');
    }

    async ensureRunning(): Promise<void> {
        const composePath = this.getProxyComposePath();
        const args = ['compose', '-f', composePath, '-p', this.projectName, 'up', '-d'];

        const result = await this.exec('docker', args, process.cwd());

        if (result.exitCode !== 0) {
            throw new Error(
                `Failed to start Traefik proxy: ${result.stderr || result.stdout || result.exitCode}`,
            );
        }

        this.logger.log('Traefik proxy (kubeara-proxy) is running on ports 80/443');
    }

    private exec(
        command: string,
        args: string[],
        cwd: string,
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
        return new Promise((resolve) => {
            const child = spawn(command, args, { cwd, env: process.env });
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (chunk: Buffer) => {
                stdout += chunk.toString();
            });
            child.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });
            child.on('close', (code) => {
                resolve({ exitCode: code ?? 1, stdout, stderr });
            });
        });
    }
}
