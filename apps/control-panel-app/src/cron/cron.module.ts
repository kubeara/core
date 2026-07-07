import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AgentHealthService } from "./agent-health/agent-health.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [AgentHealthService],
})
export class CronModule {}
