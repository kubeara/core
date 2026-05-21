import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import {
  ComposeParserModule,
  EncryptionModule,
  TemplateConfigModule,
  TemplatePayloadModule,
} from "@shared/common";

import { ServiceTemplateEntity } from "../modules/templates/entities/service-template.entity";
import { WebsocketModule } from "../websocket/websocket.module";
import { EnvironmentVariableEntity } from "./entities/environment-variable.entity";
import { ServiceDeploymentEntity } from "./entities/service-deployment.entity";
import { DeploymentsService } from "./deployments.service";
import { DeployController } from "./deploy.controller";
import { DeploymentsController } from "./deployments.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceDeploymentEntity,
      EnvironmentVariableEntity,
      ServiceTemplateEntity,
    ]),
    forwardRef(() => WebsocketModule),
    EncryptionModule,
    TemplatePayloadModule,
    TemplateConfigModule,
    ComposeParserModule,
  ],
  controllers: [DeployController, DeploymentsController],
  providers: [DeploymentsService],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
