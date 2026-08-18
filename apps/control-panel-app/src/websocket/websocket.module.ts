import { Module, forwardRef } from "@nestjs/common";
import { DeploymentGateway } from "./websocket.gateway";
import { DeploymentStreamBufferService } from "./deployment-stream-buffer.service";
import { DeploymentsModule } from "@control-panel/modules/deployments/deployments.module";
import { ServerConnectionsModule } from "@control-panel/modules/server-connections/server-connections.module";
import { TerminalModule } from "@control-panel/modules/terminal/terminal.module";

@Module({
  imports: [
    forwardRef(() => DeploymentsModule),
    forwardRef(() => ServerConnectionsModule),
    forwardRef(() => TerminalModule),
  ],
  providers: [DeploymentStreamBufferService, DeploymentGateway],
  exports: [DeploymentGateway],
})
export class WebsocketModule {}
