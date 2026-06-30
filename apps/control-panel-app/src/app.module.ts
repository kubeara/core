import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ServiceTemplateModule } from "./modules/service-template/service-template.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { EncryptionModule } from "@shared/common";
import path from "path";

import { ServerConnectionsModule } from "./modules/server-connections/server-connections.module";
import { AgentHealthModule } from "./modules/server-connections/agent-health/agent-health.module";
import { SshModule } from "@shared/ssh";
import { DeploymentsModule } from "./modules/deployments/deployments.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProfileModule } from "./modules/profile/profile.module";
import { McpApiKeysModule } from "./modules/mcp-api-keys/mcp-api-keys.module";
import { McpOAuthModule } from "./modules/mcp-oauth/mcp-oauth.module";
import { McpServerModule } from "./modules/mcp-server/mcp-server.module";
import { TerminalModule } from "./modules/terminal/terminal.module";
import { LokiLoggerModule } from "./modules/loki-logger";
import { AppController } from "./app.controller";
import { isProductionEnv } from "@control-panel/constants/env.constant";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, "../.env"),
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        try {
          const isProduction = isProductionEnv(
            configService.get<string>("NODE_ENV"),
          );

          return {
            type: "postgres",
            host: configService.get<string>("DB_HOST"),
            port: Number(configService.get<string>("DB_PORT")),
            username: configService.get<string>("DB_USERNAME"),
            password: configService.get<string>("DB_PASSWORD"),
            database: configService.get<string>("DB_DATABASE"),
            synchronize: false,
            migrationsRun: false,
            entities: [__dirname + "/modules/**/entities/*{.ts,.js}"],
            migrations: [path.join(__dirname, "../../migrations/*{.js,.ts}")],
            ...(isProduction ? { ssl: { rejectUnauthorized: false } } : {}),
          };
        } catch (error) {
          throw new Error(
            `Failed to build TypeORM configuration: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    }),
    LokiLoggerModule,
    ServiceTemplateModule,
    DeploymentsModule,
    ServerConnectionsModule,
    AgentHealthModule,
    SshModule,
    EncryptionModule,
    WebsocketModule,
    AuthModule,
    UsersModule,
    ProfileModule,
    McpApiKeysModule,
    McpOAuthModule,
    McpServerModule,
    TerminalModule,
  ],
  controllers: [AppController],
  providers: [],
  exports: [],
})
export class AppModule {}
