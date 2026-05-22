import { Body, Controller, Param, Post } from "@nestjs/common";
import { ServerConnectionsService } from "../services/server-connections.service";
import { CreateServerOnboardRequestDto } from "../dto/create-server-onboard.request.dto";

@Controller("servers")
export class ServersController {
  constructor(private readonly connectionsService: ServerConnectionsService) {}

  /**
   * create server
   * @param body
   * @returns
   */
  @Post("onboard")
  async onboard(@Body() body: CreateServerOnboardRequestDto): Promise<unknown> {
    return await this.connectionsService.onboardServer(body);
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
