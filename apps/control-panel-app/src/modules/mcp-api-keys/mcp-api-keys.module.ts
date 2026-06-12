import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { McpApiKeysController } from "./controllers/mcp-api-keys.controller";
import { McpApiKeyEntity } from "./entities/mcp-api-key.entity";
import { McpApiKeysService } from "./services/mcp-api-keys.service";

@Module({
  imports: [TypeOrmModule.forFeature([McpApiKeyEntity])],
  controllers: [McpApiKeysController],
  providers: [McpApiKeysService],
  exports: [McpApiKeysService],
})
export class McpApiKeysModule {}
