import { Module } from "@nestjs/common";
import { DeployController } from "./controllers/deploy.controller";
import { ServiceTemplateModule } from "../service-template/service-template.module";
import { WebsocketModule } from "../../websocket/websocket.module";
import { ServerConnectionsModule } from "../server-connections/server-connections.module";
import { EncryptionModule, TemplateConfigModule } from "@shared/common";

@Module({
  imports: [
    ServiceTemplateModule,
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
