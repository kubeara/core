import { Module, forwardRef } from "@nestjs/common";
import { DeploymentGateway } from "./websocket.gateway";
import { DeploymentsModule } from "@control-panel/modules/deployments/deployments.module";
import { ServerConnectionsModule } from "@control-panel/modules/server-connections/server-connections.module";

@Module({
  imports: [forwardRef(() => DeploymentsModule), ServerConnectionsModule],
  providers: [DeploymentGateway],
  exports: [DeploymentGateway],
})
export class WebsocketModule {}
