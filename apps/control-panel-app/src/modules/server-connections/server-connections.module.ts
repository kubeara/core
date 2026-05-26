import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ServersController } from "./controllers/servers.controller";

import { ServerEntity } from "./entities/server.entity";
import { ServerSshCredentialEntity } from "./entities/server-ssh-credential.entity";

import { ServerConnectionsService } from "./services/server-connections.service";
import { RemoteAgentInstallService } from "./services/remote-agent-install.service";
import { SshModule } from "@shared/ssh";

@Module({
  imports: [
    TypeOrmModule.forFeature([ServerEntity, ServerSshCredentialEntity]),
    SshModule,
  ],
  controllers: [ServersController],
  providers: [ServerConnectionsService, RemoteAgentInstallService],
  exports: [ServerConnectionsService],
})
export class ServerConnectionsModule {}
