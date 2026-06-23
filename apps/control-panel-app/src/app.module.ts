import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ServiceTemplateModule } from "./modules/service-template/service-template.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { EncryptionModule } from "@shared/common";
import path from "path";

import { ServerConnectionsModule } from "./modules/server-connections/server-connections.module";
import { SshModule } from "@shared/ssh";
import { DeploymentsModule } from "./modules/deployments/deployments.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { ProfileModule } from "./modules/profile/profile.module";
import { McpApiKeysModule } from "./modules/mcp-api-keys/mcp-api-keys.module";
import { McpServerModule } from "./modules/mcp-server/mcp-server.module";
import { TerminalModule } from "./modules/terminal/terminal.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";
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
    ServiceTemplateModule,
    DeploymentsModule,
    ServerConnectionsModule,
    SshModule,
    EncryptionModule,
    WebsocketModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ProfileModule,
    McpApiKeysModule,
    McpServerModule,
    TerminalModule,
    SubscriptionsModule,
  ],
  controllers: [AppController],
  providers: [],
  exports: [],
})
export class AppModule {}
