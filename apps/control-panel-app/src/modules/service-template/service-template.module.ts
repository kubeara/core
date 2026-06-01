import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import {
  EncryptionModule,
  TemplateConfigModule,
  TemplatePayloadModule,
} from "@shared/common";

import { WebsocketModule } from "../../websocket/websocket.module";
import { ServiceTemplateController } from "./controllers/service-template.controller";
import { ServiceTemplateEntity } from "./entities/service-template.entity";
import { ServiceTemplateService } from "./services/service-template.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceTemplateEntity]),
    WebsocketModule,
    TemplatePayloadModule,
    TemplateConfigModule,
    EncryptionModule,
  ],
  controllers: [ServiceTemplateController],
  providers: [ServiceTemplateService],
  exports: [ServiceTemplateService],
})
export class ServiceTemplateModule {}
