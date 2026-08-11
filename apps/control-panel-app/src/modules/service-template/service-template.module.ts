import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import {
  EncryptionModule,
  TemplateConfigModule,
  ComposeParserModule,
  TemplatePayloadModule,
} from "@shared/common";

import { WebsocketModule } from "../../websocket/websocket.module";
import { ServiceTemplateController } from "./controllers/service-template.controller";
import { ServiceTemplateTranslationEntity } from "./entities/service-template-translation.entity";
import { ServiceTemplateEntity } from "./entities/service-template.entity";
import { ServiceTemplateService } from "./services/service-template.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceTemplateEntity,
      ServiceTemplateTranslationEntity,
    ]),
    WebsocketModule,
    TemplatePayloadModule,
    ComposeParserModule,
    TemplateConfigModule,
    EncryptionModule,
  ],
  controllers: [ServiceTemplateController],
  providers: [ServiceTemplateService],
  exports: [ServiceTemplateService],
})
export class ServiceTemplateModule {}
