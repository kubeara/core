import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServerConnectionsModule } from "@control-panel/modules/server-connections/server-connections.module";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { AgentHealthService } from "./agent-health/agent-health.service";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([ServerEntity]),
    ServerConnectionsModule,
  ],
  providers: [AgentHealthService],
})
export class CronModule {}
