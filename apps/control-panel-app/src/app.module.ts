import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TemplatesModule } from './templates/templates.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { WebsocketModule } from './websocket/websocket.module';
import { ServiceTemplateEntity } from './templates/entities/service-template.entity';
import { ServiceDeploymentEntity } from './deployments/entities/service-deployment.entity';
import { EnvironmentVariableEntity } from './deployments/entities/environment-variable.entity';
import { EncryptionModule } from '@shared/common';
import path from 'path';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: path.join(__dirname, '../.env'),
        }),

        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                try {
                    return {
                        type: 'postgres',
                        host: configService.get<string>('DB_HOST', 'localhost'),
                        port: Number(configService.get<string>('DB_PORT', '5432')),
                        username: configService.get<string>('DB_USERNAME', 'postgres'),
                        password: configService.get<string>('DB_PASSWORD', 'postgres'),
                        database: configService.get<string>('DB_DATABASE', 'templates'),
                        synchronize: true,
                        entities: [
                            ServiceTemplateEntity,
                            ServiceDeploymentEntity,
                            EnvironmentVariableEntity,
                        ],
                    };
                } catch (error) {
                    throw new Error(`Failed to build TypeORM configuration: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
        }),

        TemplatesModule,
        DeploymentsModule,
        WebsocketModule,
        EncryptionModule,
    ],
    providers: [],
    exports: [],
})
export class AppModule { }
