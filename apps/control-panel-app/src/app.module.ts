import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TemplatesModule } from './templates/templates.module';
import { WebsocketModule } from './websocket/websocket.module';
import { ServiceTemplateEntity } from './templates/entities/service-template.entity';
import { EncryptionModule } from '@shared/common';
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),

        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                host: configService.get<string>('DB_HOST', 'localhost'),
                port: Number(configService.get<string>('DB_PORT', '5432')),
                username: configService.get<string>('DB_USERNAME', 'postgres'),
                password: configService.get<string>('DB_PASSWORD', 'postgres'),
                database: configService.get<string>('DB_DATABASE', 'templates'),
                synchronize: true,
                entities: [ServiceTemplateEntity],
            }),
        }),

        TemplatesModule,
        WebsocketModule,
        EncryptionModule,
    ],
    providers: [],
    exports: [],
})
export class AppModule { }
