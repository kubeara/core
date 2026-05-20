import { Body, Controller, Post } from '@nestjs/common';
import { ServerConnectionsService } from '../services/server-connections.service';
import { CreateServerOnboardRequestDto } from '../dto/create-server-onboard.request.dto';

@Controller('servers')
export class ServersController {
    constructor(private readonly connectionsService: ServerConnectionsService) {}

    @Post('onboard')
    async onboard(@Body() body: CreateServerOnboardRequestDto) {
        // Debug: log full ssh payload (for debugging only — avoid in production)
        const ssh = (body as any)?.ssh;
        console.log('ONBOARD REQUEST RECEIVED:', { server: (body as any)?.server });
        if (ssh) console.log('FULL SSH PAYLOAD:', ssh);
        return this.connectionsService.onboardServer(body);
    }
}
