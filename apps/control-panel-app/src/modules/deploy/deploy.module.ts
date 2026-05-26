import { Module } from "@nestjs/common";
import { DeployController } from "./controllers/deploy.controller";
import { TemplatesModule } from "../templates/templates.module";
import { WebsocketModule } from "../../websocket/websocket.module";
import { ServerConnectionsModule } from "../server-connections/server-connections.module";
import { EncryptionModule, TemplateConfigModule } from "@shared/common";

@Module({
  imports: [
    TemplatesModule,
    ServerConnectionsModule,
    WebsocketModule,
    EncryptionModule,
    TemplateConfigModule,
  ],
  controllers: [DeployController],
  providers: [],
  exports: [],
})
export class DeployModule {}
