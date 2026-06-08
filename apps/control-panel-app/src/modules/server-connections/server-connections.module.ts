import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WebsocketModule } from "@control-panel/websocket/websocket.module";

import { ServersController } from "./controllers/servers.controller";

import { ServerEntity } from "./entities/server.entity";
import { ServerSshCredentialEntity } from "./entities/server-ssh-credential.entity";

import { ServerConnectionsService } from "./services/server-connections.service";
import { AgentInstallService } from "./services/agent-install.service";
import { RemoteAgentInstallService } from "./services/remote-agent-install.service";
import { LocalServerService } from "./services/local-server.service";
import { AgentServerBindingService } from "./services/agent-server-binding.service";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { SshModule } from "@shared/ssh";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServerEntity,
      ServerSshCredentialEntity,
      UserEntity,
    ]),
    SshModule,
    forwardRef(() => WebsocketModule),
  ],
  controllers: [ServersController],
  providers: [
    ServerConnectionsService,
    AgentInstallService,
    RemoteAgentInstallService,
    LocalServerService,
    AgentServerBindingService,
  ],
  exports: [
    ServerConnectionsService,
    AgentInstallService,
    LocalServerService,
    AgentServerBindingService,
  ],
})
export class ServerConnectionsModule {}
