import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { McpApiKeysModule } from "@control-panel/modules/mcp-api-keys/mcp-api-keys.module";
import { McpOAuthModule } from "@control-panel/modules/mcp-oauth/mcp-oauth.module";

import { McpServerController } from "./controllers/mcp-server.controller";
import { McpAuthService } from "./services/mcp-auth.service";
import { McpServerService } from "./services/mcp-server.service";
import { McpToolsModule } from "./tools/tools.module";

@Module({
  imports: [
    McpToolsModule,
    McpApiKeysModule,
    McpOAuthModule,
    JwtModule.register({}),
  ],
  controllers: [McpServerController],
  providers: [McpServerService, McpAuthService],
})
export class McpServerModule {}
