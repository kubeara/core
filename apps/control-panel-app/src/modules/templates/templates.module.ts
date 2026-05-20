import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatesService } from './services/templates.service';
import { TemplatePayloadModule, TemplateConfigModule, EncryptionModule } from '@shared/common';
import { TemplatesController } from './controllers/templates.controller';
import { ServiceTemplateEntity } from './entities/service-template.entity';
import { WebsocketModule } from '../../websocket/websocket.module';

@Module({
    imports: [TypeOrmModule.forFeature([ServiceTemplateEntity]), WebsocketModule, TemplatePayloadModule, TemplateConfigModule, EncryptionModule],
    controllers: [TemplatesController],
    providers: [TemplatesService],
    exports: [TemplatesService],
})
export class TemplatesModule { }
