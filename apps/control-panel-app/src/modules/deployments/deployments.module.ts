import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import {
  ComposeParserModule,
  EncryptionModule,
  TemplateConfigModule,
  TemplatePayloadModule,
} from "@shared/common";

import { EnvironmentVariableEntity } from "./entities/environment-variable.entity";
import { ServiceDeploymentEntity } from "./entities/service-deployment.entity";
import { DeploymentsService } from "./deployments.service";
import { DeployController } from "./deploy.controller";
import { DeploymentsController } from "./deployments.controller";
import { WebsocketModule } from "@control-panel/websocket/websocket.module";
import { ServiceTemplateEntity } from "../templates";

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
