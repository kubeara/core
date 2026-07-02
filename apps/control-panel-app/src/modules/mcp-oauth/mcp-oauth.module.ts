import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";

import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

import {
  McpOAuthController,
  McpOAuthMetadataController,
} from "./controllers/mcp-oauth.controller";
import { McpOAuthAuthorizationCodeEntity } from "./entities/mcp-oauth-authorization-code.entity";
import { McpOAuthRefreshTokenEntity } from "./entities/mcp-oauth-refresh-token.entity";
import { McpOAuthAuthorizeService } from "./services/mcp-oauth-authorize.service";
import { McpOAuthConfigService } from "./services/mcp-oauth-config.service";
import { McpOAuthJwtService } from "./services/mcp-oauth-jwt.service";
import { McpOAuthTokenService } from "./services/mcp-oauth-token.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      McpOAuthAuthorizationCodeEntity,
      McpOAuthRefreshTokenEntity,
      UserEntity,
    ]),
    JwtModule.register({}),
  ],
  controllers: [McpOAuthMetadataController, McpOAuthController],
  providers: [
    McpOAuthConfigService,
    McpOAuthJwtService,
    McpOAuthAuthorizeService,
    McpOAuthTokenService,
  ],
  exports: [McpOAuthConfigService, McpOAuthJwtService],
})
export class McpOAuthModule {}
