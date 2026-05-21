import { Module, forwardRef } from "@nestjs/common";
import { DeploymentGateway } from "./websocket.gateway";
import { DeploymentsModule } from "../modules/deployments/deployments.module";

@Module({
  imports: [forwardRef(() => DeploymentsModule)],
  providers: [DeploymentGateway],
  exports: [DeploymentGateway],
})
export class WebsocketModule {}
