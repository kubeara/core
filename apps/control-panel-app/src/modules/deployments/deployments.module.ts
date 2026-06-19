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
import { DeploymentsController } from "./deployments.controller";
import { WebsocketModule } from "@control-panel/websocket/websocket.module";
import { ServerConnectionsModule } from "../server-connections/server-connections.module";
import { ServiceTemplateEntity } from "../service-template/entities/service-template.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceDeploymentEntity,
      EnvironmentVariableEntity,
      ServiceTemplateEntity,
    ]),
    forwardRef(() => ServerConnectionsModule),
    forwardRef(() => WebsocketModule),
    EncryptionModule,
    TemplatePayloadModule,
    TemplateConfigModule,
    ComposeParserModule,
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
