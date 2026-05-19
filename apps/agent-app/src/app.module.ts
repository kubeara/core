import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SocketClientService } from './socket-client/socket-client.service';
import { HealthController } from './health/health.controller';
import { FilesystemService } from './filesystem/filesystem.service';
import { DeployTemplateExecutor } from './executors/deploy-template.executor';
import {
    ComposeParserModule,
    EncryptionModule,
    TemplatePayloadModule,
    TemplateConfigModule,
} from '@shared/common';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        EncryptionModule,
        TemplatePayloadModule,
        TemplateConfigModule,
        ComposeParserModule,
    ],
    controllers: [HealthController],
    providers: [SocketClientService, FilesystemService, DeployTemplateExecutor],
})
export class AppModule implements OnModuleInit {
    constructor(private readonly socketClientService: SocketClientService) { }

    onModuleInit(): void {
        // Connect to control panel via WebSocket
        this.socketClientService.connect();
    }
}
