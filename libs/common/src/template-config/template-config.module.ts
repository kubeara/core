import { Module } from '@nestjs/common';
import { TemplateConfigService } from './template-config.service';

@Module({
    providers: [TemplateConfigService],
    exports: [TemplateConfigService],
})
export class TemplateConfigModule { }
