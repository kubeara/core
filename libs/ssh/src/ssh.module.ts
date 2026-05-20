import { Module } from '@nestjs/common';
import { EncryptionModule } from '@shared/common';
import { SshConnectionManager } from './managers/ssh-connection-manager.service';
import { SshCommandExecutorService } from './services/ssh-command-executor.service';
import { SshHealthCheckService } from './services/ssh-health-check.service';

@Module({
    imports: [EncryptionModule],
    providers: [SshConnectionManager, SshCommandExecutorService, SshHealthCheckService],
    exports: [SshConnectionManager, SshCommandExecutorService, SshHealthCheckService],
})
export class SshModule {}
