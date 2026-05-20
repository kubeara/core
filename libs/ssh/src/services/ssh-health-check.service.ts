import { Injectable, Logger } from '@nestjs/common';
import { SshConnectionManager } from '../managers/ssh-connection-manager.service';
import { SshCommandExecutorService } from './ssh-command-executor.service';
import { ExecuteResult } from '../types/execute-result.interface';
import { SshConnectionOptions } from '../interfaces/ssh-connection-options.interface';

@Injectable()
export class SshHealthCheckService {
    private readonly logger = new Logger(SshHealthCheckService.name);

    constructor(
        private readonly manager: SshConnectionManager,
        private readonly executor: SshCommandExecutorService,
    ) {}

    async testConnection(options: SshConnectionOptions) {
        const start = Date.now();
        const client = await this.manager.connect(options);
        const latency = Date.now() - start;

        try {
            const pwd = await this.executor.executeCommand(client, 'pwd');
            const whoami = await this.executor.executeCommand(client, 'whoami');
            const uname = await this.executor.executeCommand(client, 'uname -a');

            return {
                success: true,
                latency,
                username: whoami.stdout.trim(),
                hostname: pwd.stdout.trim(),
                platform: uname.stdout.trim(),
                message: 'OK',
            } as const;
        } catch (err) {
            this.logger.warn(`Health check failed: ${(err as Error).message}`);
            return {
                success: false,
                latency,
                username: null,
                hostname: null,
                platform: null,
                message: (err as Error).message,
            } as const;
        }
    }
}
