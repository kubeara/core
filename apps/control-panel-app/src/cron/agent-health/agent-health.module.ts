import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { ServerConnectionsModule } from "@control-panel/modules/server-connections/server-connections.module";
import { WebsocketModule } from "@control-panel/websocket/websocket.module";

import { AgentHealthCheckService } from "./agent-health-check.service";
import { AgentHealthCron } from "./agent-health.cron";
import { AgentHealthService } from "./agent-health.service";
import { ServerHealthRepository } from "./repositories/server-health.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([ServerEntity]),
    forwardRef(() => ServerConnectionsModule),
    forwardRef(() => WebsocketModule),
  ],
  providers: [
    ServerHealthRepository,
    AgentHealthCheckService,
    AgentHealthService,
    AgentHealthCron,
  ],
})
export class AgentHealthModule {}
