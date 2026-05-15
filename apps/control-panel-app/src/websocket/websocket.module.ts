import { Module } from '@nestjs/common';
import { DeploymentGateway } from './websocket.gateway';

@Module({
    providers: [DeploymentGateway],
    exports: [DeploymentGateway],
})
export class WebsocketModule { }
