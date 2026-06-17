import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import {
  EncryptionModule,
  TemplateConfigModule,
  ComposeParserModule,
  TemplatePayloadModule,
} from "@shared/common";

import { WebsocketModule } from "../../websocket/websocket.module";
import { PublicServiceTemplateController } from "./controllers/public-service-template.controller";
import { ServiceTemplateController } from "./controllers/service-template.controller";
import { KubearaPublicOriginGuard } from "../../common/guards/kubeara-public-origin.guard";
import { ServiceTemplateEntity } from "./entities/service-template.entity";
import { ServiceTemplateService } from "./services/service-template.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceTemplateEntity]),
    WebsocketModule,
    TemplatePayloadModule,
    ComposeParserModule,
    TemplateConfigModule,
    EncryptionModule,
  ],
  controllers: [ServiceTemplateController, PublicServiceTemplateController],
  providers: [ServiceTemplateService, KubearaPublicOriginGuard],
  exports: [ServiceTemplateService],
})
export class ServiceTemplateModule {}
