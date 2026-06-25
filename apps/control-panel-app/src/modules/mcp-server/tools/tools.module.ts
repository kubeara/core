import { Module } from "@nestjs/common";

import { AuthModule } from "@control-panel/modules/auth/auth.module";
import { ServerConnectionsModule } from "@control-panel/modules/server-connections/server-connections.module";

import { McpToolsService } from "./tools.service";

@Module({
  imports: [AuthModule, ServerConnectionsModule],
  providers: [McpToolsService],
  exports: [McpToolsService],
})
export class McpToolsModule {}
