import { Body, Controller, Post } from "@nestjs/common";
import { ServerConnectionsService } from "../services/server-connections.service";
import { CreateServerOnboardRequestDto } from "../dto/create-server-onboard.request.dto";

@Controller("servers")
export class ServersController {
  constructor(private readonly connectionsService: ServerConnectionsService) {}

  @Post("onboard")
  async onboard(@Body() body: CreateServerOnboardRequestDto): Promise<unknown> {
    // Debug only — avoid logging credentials in production
    const ssh = body.ssh;

    console.log("ONBOARD REQUEST RECEIVED:", {
      server: body.server,
    });

    if (ssh) {
      console.log("FULL SSH PAYLOAD:", ssh);
    }

    return await this.connectionsService.onboardServer(body);
  }
}
