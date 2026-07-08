import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { CronService } from "./cron.service";

/**
 * Registers NestJS scheduling and all cron job providers for the control panel.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CronService],
})
export class CronModule {}
