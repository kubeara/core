import { Controller, Get } from '@nestjs/common';
import { SocketClientService } from '../socket-client/socket-client.service';

@Controller('health')
export class HealthController {
    constructor(private readonly socketClientService: SocketClientService) { }

    @Get()
    health(): {
        status: string;
        agentId: string;
        socketConnected: boolean;
        timestamp: string;
    } {
        return {
            status: 'ok',
            agentId: this.socketClientService.getAgentId(),
            socketConnected: this.socketClientService.isConnected(),
            timestamp: new Date().toISOString(),
        };
    }
}
