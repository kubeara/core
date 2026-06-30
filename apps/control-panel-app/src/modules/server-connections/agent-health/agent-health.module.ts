import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { WebsocketModule } from "@control-panel/websocket/websocket.module";
import { ServerConnectionsModule } from "../server-connections.module";
import { ServerEntity } from "../entities/server.entity";
import { ServerHealthRepository } from "./repositories/server-health.repository";
import { AgentHealthService } from "./services/agent-health.service";
import { AgentHealthCronService } from "./services/agent-health-cron.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ServerEntity]),
    forwardRef(() => ServerConnectionsModule),
    forwardRef(() => WebsocketModule),
  ],
  providers: [
    ServerHealthRepository,
    AgentHealthService,
    AgentHealthCronService,
  ],
  exports: [AgentHealthService],
})
export class AgentHealthModule {}
