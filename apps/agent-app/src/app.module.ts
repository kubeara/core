import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SocketClientService } from "./socket-client/socket-client.service";
import { ContainerService } from "./container/container.service";
import { ServerResourcesService } from "./server-resources/server-resources.service";
import { HealthController } from "./health/health.controller";
import { FilesystemService } from "./filesystem/filesystem.service";
import { DeployTemplateExecutor } from "./executors/deploy-template.executor";
import { TraefikProxyService } from "./proxy/traefik-proxy.service";
import {
  ComposeParserModule,
  EncryptionModule,
  TemplatePayloadModule,
  TemplateConfigModule,
} from "@shared/common";

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
  providers: [
    SocketClientService,
    ContainerService,
    ServerResourcesService,
    FilesystemService,
    DeployTemplateExecutor,
    TraefikProxyService,
  ],
})
export class AppModule implements OnModuleInit {
  /**
   * Creates app module with socket client dependency.
   * @param socketClientService Agent socket client for lifecycle connect.
   */
  constructor(private readonly socketClientService: SocketClientService) {}

  /**
   * Connects websocket client when Nest module initialization completes.
   * @returns Void.
   */
  onModuleInit(): void {
    try {
      // Connect to control panel via WebSocket
      this.socketClientService.connect();
    } catch (error) {
      throw new Error(
        `Failed during agent module initialization: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
