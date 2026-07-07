import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WebsocketModule } from "@control-panel/websocket/websocket.module";
import { DeploymentsModule } from "@control-panel/modules/deployments/deployments.module";

import { ServersController } from "./controllers/servers.controller";
import { AgentHealthController } from "./controllers/agent-health.controller";

import { ServerEntity } from "./entities/server.entity";
import { ServerSshCredentialEntity } from "./entities/server-ssh-credential.entity";

import { ServerConnectionsService } from "./services/server-connections.service";
import { AgentInstallService } from "./services/agent-install.service";
import { RemoteAgentInstallService } from "./services/remote-agent-install.service";
import { LocalServerService } from "./services/local-server.service";
import { AgentServerBindingService } from "./services/agent-server-binding.service";
import { AgentHealthCheckService } from "./services/agent-health-check.service";
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
    forwardRef(() => DeploymentsModule),
  ],
  controllers: [ServersController, AgentHealthController],
  providers: [
    ServerConnectionsService,
    AgentInstallService,
    RemoteAgentInstallService,
    LocalServerService,
    AgentServerBindingService,
    AgentHealthCheckService,
  ],
  exports: [
    ServerConnectionsService,
    AgentInstallService,
    LocalServerService,
    AgentServerBindingService,
    AgentHealthCheckService,
  ],
})
export class ServerConnectionsModule {}
