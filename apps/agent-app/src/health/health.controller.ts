import { Controller, Get } from '@nestjs/common';
import { SocketClientService } from '../socket-client/socket-client.service';

@Controller('health')
export class HealthController {
    /**
     * Creates health controller with socket client dependency.
     * @param socketClientService Connected agent socket state provider.
     */
    constructor(private readonly socketClientService: SocketClientService) { }

    /**
     * Returns current health and socket metadata for the running agent.
     * @returns Health payload used by probes and diagnostics.
     */
    @Get()
    health(): {
        status: string;
        agentId: string;
        socketConnected: boolean;
        timestamp: string;
    } {
        try {
            return {
                status: 'ok',
                agentId: this.socketClientService.getAgentId(),
                socketConnected: this.socketClientService.isConnected(),
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            throw new Error(`Failed to build health response: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
