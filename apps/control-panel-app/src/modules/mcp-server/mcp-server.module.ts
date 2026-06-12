import { Module } from "@nestjs/common";

import { McpApiKeysModule } from "@control-panel/modules/mcp-api-keys/mcp-api-keys.module";

import { McpServerController } from "./controllers/mcp-server.controller";
import { McpAuthService } from "./services/mcp-auth.service";
import { McpServerService } from "./services/mcp-server.service";
import { McpToolsModule } from "./tools/tools.module";

@Module({
  imports: [McpToolsModule, McpApiKeysModule],
  controllers: [McpServerController],
  providers: [McpServerService, McpAuthService],
})
export class McpServerModule {}
