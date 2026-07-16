import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import {
  ComposeParserModule,
  EncryptionModule,
  TemplateConfigModule,
  TemplatePayloadModule,
} from "@shared/common";
import { SshModule } from "@shared/ssh";

import { EnvironmentVariableEntity } from "./entities/environment-variable.entity";
import { ServiceDeploymentEntity } from "./entities/service-deployment.entity";
import { DeploymentsService } from "./deployments.service";
import { DeploymentsController } from "./deployments.controller";
import { WebsocketModule } from "@control-panel/websocket/websocket.module";
import { ServerConnectionsModule } from "../server-connections/server-connections.module";
import { ServerSshCredentialEntity } from "../server-connections/entities/server-ssh-credential.entity";
import { ServiceTemplateEntity } from "../service-template/entities/service-template.entity";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceDeploymentEntity,
      EnvironmentVariableEntity,
      ServiceTemplateEntity,
      ServerSshCredentialEntity,
    ]),
    forwardRef(() => ServerConnectionsModule),
    forwardRef(() => WebsocketModule),
    ActivityModule,
    EncryptionModule,
    TemplatePayloadModule,
    TemplateConfigModule,
    ComposeParserModule,
    SshModule,
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
