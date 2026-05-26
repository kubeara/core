import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@control-panel/modules/auth/guards/jwt-auth.guard";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

import { ServerConnectionsService } from "../services/server-connections.service";
import { LocalServerService } from "../services/local-server.service";
import { CreateServerOnboardRequestDto } from "../dto/create-server-onboard.request.dto";

@Controller("servers")
@UseGuards(JwtAuthGuard)
export class ServersController {
  constructor(
    private readonly connectionsService: ServerConnectionsService,
    private readonly localServerService: LocalServerService,
  ) {}

  /**
   * Returns the current user's local machine server when it already exists.
   * Create it via deploy with `deployOnLocal: true` (POST /deploy/compose).
   */
  @Get("local")
  async getLocalServer(@Req() req: { user: UserEntity }) {
    const server = await this.localServerService.findLocalServer(req.user.id);

    if (!server) {
      throw new NotFoundException(
        "No local server yet. Deploy with deployOnLocal=true to create one.",
      );
    }

    return {
      serverId: server.id,
      name: server.name,
      host: server.host,
      serverType: server.serverType,
    };
  }

  /**
   * create server
   * @param body
   * @returns
   */
  @Post("onboard")
  async onboard(
    @Req() req: { user: UserEntity },
    @Body() body: CreateServerOnboardRequestDto,
  ): Promise<unknown> {
    return await this.connectionsService.onboardServer(body, req.user.id);
  }

  /**
   * connect with the server
   * @param id
   * @returns
   */
  @Post(":id/connect")
  async connect(@Param("id") id: string) {
    return await this.connectionsService.connectServer(id);
  }

  /**
   * disconnect server
   * @param id
   * @returns
   */
  @Post(":id/disconnect")
  async disconnect(@Param("id") id: string) {
    return await this.connectionsService.disconnectServer(id);
  }

  /**
   * soft delete server
   * @param id
   * @returns
   */
  @Post(":id/delete")
  deleteServer(@Param("id") id: string) {
    return this.connectionsService.deleteServer(id);
  }
}
