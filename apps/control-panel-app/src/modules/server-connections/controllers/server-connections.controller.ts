import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
} from "@nestjs/common";
import { ServerConnectionsService } from "../services/server-connections.service";
import { ExecuteCommandDto } from "@shared/ssh";

@Controller("server-connections")
export class ServerConnectionsController {
  constructor(private readonly connectionsService: ServerConnectionsService) {}

  private readonly logger = new Logger(ServerConnectionsController.name);

  // Removed: POST /server-connections (server creation moved to POST /servers/onboard)

  @Get()
  async list() {
    return this.connectionsService.list();
  }

  @Get(":id")
  async get(@Param("id") id: string): Promise<unknown> {
    return this.connectionsService.get(id);
  }

  async patch(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return await this.connectionsService.patch(id, body);
  }

  @Delete(":id")
  async remove(@Param("id") id: string): Promise<unknown> {
    await this.connectionsService.remove(id);
    return { success: true };
  }

  @Post(":id/test")
  async test(@Param("id") id: string): Promise<unknown> {
    return this.connectionsService.test(id);
  }

  @Post(":id/credentials")
  // Removed: endpoint for adding SSH credentials. Use POST /servers/onboard instead.
  @Post(":id/execute")
  async execute(
    @Param("id") id: string,
    @Body() body: ExecuteCommandDto,
  ): Promise<unknown> {
    return await this.connectionsService.execute(id, body);
  }
}
