import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ActivityController } from "./controllers/activity.controller";
import { ActivityEntity } from "./entities/activity.entity";
import { ActivityService } from "./services/activity.service";

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEntity])],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
