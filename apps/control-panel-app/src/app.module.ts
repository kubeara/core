import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { TemplatesModule } from "./templates/templates.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { EncryptionModule } from "@shared/common";
import path from "path";

import { ServerConnectionsModule } from "./modules/server-connections/server-connections.module";
import { SshModule } from "@shared/ssh";
import { DeploymentsModule } from "./modules/deployments/deployments.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
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
          return {
            type: "postgres",
            host: configService.get<string>("DB_HOST"),
            port: Number(configService.get<string>("DB_PORT")),
            username: configService.get<string>("DB_USERNAME", "postgres"),
            password: configService.get<string>("DB_PASSWORD", "postgres"),
            database: configService.get<string>("DB_DATABASE", "templates"),
            synchronize: false,
            migrationsRun: false,
            entities: [__dirname + "/modules/**/entities/*{.ts,.js}"],
            migrations: [path.join(__dirname, "../../migrations/*{.js,.ts}")],
          };
        } catch (error) {
          throw new Error(
            `Failed to build TypeORM configuration: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    }),
    TemplatesModule,
    DeploymentsModule,
    TemplatesModule,
    ServerConnectionsModule,
    SshModule,
    EncryptionModule,
    WebsocketModule,
    AuthModule,
    UsersModule,
  ],
  providers: [],
  exports: [],
})
export class AppModule {}
