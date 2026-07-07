import { Module } from "@nestjs/common";

import { AgentHealthModule } from "./agent-health/agent-health.module";

@Module({
  imports: [AgentHealthModule],
})
export class CronModule {}
