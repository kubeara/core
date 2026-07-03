import { Module } from "@nestjs/common";

import { AuthModule } from "@control-panel/modules/auth/auth.module";
import { DeploymentsModule } from "@control-panel/modules/deployments/deployments.module";
import { ServerConnectionsModule } from "@control-panel/modules/server-connections/server-connections.module";
import { ServiceTemplateModule } from "@control-panel/modules/service-template/service-template.module";

import { McpToolsService } from "./tools.service";

@Module({
  imports: [
    AuthModule,
    ServerConnectionsModule,
    ServiceTemplateModule,
    DeploymentsModule,
  ],
  providers: [McpToolsService],
  exports: [McpToolsService],
})
export class McpToolsModule {}
