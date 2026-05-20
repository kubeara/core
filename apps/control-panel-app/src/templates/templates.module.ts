import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatesService } from './templates.service';
import { TemplatePayloadModule, TemplateConfigModule } from '@shared/common';
import { TemplatesController } from './templates.controller';
import { ServiceTemplateEntity } from '../modules/templates/entities/service-template.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([ServiceTemplateEntity]),
        TemplatePayloadModule,
        TemplateConfigModule,
    ],
    controllers: [TemplatesController],
    providers: [TemplatesService],
    exports: [TemplatesService],
})
export class TemplatesModule { }
