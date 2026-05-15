import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatesService } from './templates.service';
import { TemplatePayloadModule, TemplateConfigModule } from '@shared/common';
import { TemplatesController } from './templates.controller';
import { ServiceTemplateEntity } from './entities/service-template.entity';
import { DeployController } from '../deploy/deploy.controller';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
    imports: [TypeOrmModule.forFeature([ServiceTemplateEntity]), WebsocketModule, TemplatePayloadModule, TemplateConfigModule],
    controllers: [TemplatesController, DeployController],
    providers: [TemplatesService],
    exports: [TemplatesService],
})
export class TemplatesModule { }
