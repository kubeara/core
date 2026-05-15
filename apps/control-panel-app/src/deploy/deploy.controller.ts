import {
    Controller,
    Post,
    Body,
    Res,
    HttpCode,
    Logger,
    UsePipes,
    ValidationPipe,
    BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';

import { TemplatesService } from '../templates/templates.service';
import { DeploymentGateway } from '../websocket/websocket.gateway';
import { SocketDeployMessage } from '@shared/socket-events';
import { EncryptionService, TemplateConfigService } from '@shared/common';
import { DeployTemplateDto } from './dto/deploy-template.dto';
import { TemplateSchema, SchemaFieldDetails } from '@shared/socket-events';

@Controller('deploy')
export class DeployController {
    private readonly logger = new Logger(DeployController.name);

    constructor(
        private readonly templatesService: TemplatesService,
        private readonly deploymentGateway: DeploymentGateway,
        private readonly encryptionService: EncryptionService,
        private readonly templateConfigService: TemplateConfigService,
    ) { }

    @Post()
    @HttpCode(202)
    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    async deploy(@Body() body: DeployTemplateDto): Promise<{ message: string; template: string; deploymentId: string }> {
        const { templateSlug, env: requestEnv = {}, ports: requestPorts = {} } = body;

        this.logger.log(`Received deployment request for '${templateSlug}'`);

        // 1. Fetch template entity
        const tplEntity = await this.templatesService.getTemplateEntity(templateSlug);
        const encodedCompose = tplEntity.compose;

        if (!encodedCompose) {
            throw new BadRequestException('Template has no compose content');
        }

        // 2. Normalize and validate schema
        const schema: TemplateSchema = {
            env_schema: tplEntity.env_schema as Record<string, SchemaFieldDetails>,
            port_schema: tplEntity.port_schema as Record<string, SchemaFieldDetails>,
        };

        const normalized = this.templateConfigService.normalizeSchema(schema);
        const { env: mergedEnv, ports: mergedPorts } = this.templateConfigService.mergeAndValidate(
            { ...schema, normalized },
            { env: requestEnv, ports: requestPorts },
        );

        // 3. Generate deployment ID
        const deploymentId = `deployment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

        // 4. Encrypt payloads
        const encryptedCompose = this.encryptionService.encrypt(encodedCompose);
        const encryptedEnv = this.encryptionService.encrypt(JSON.stringify(mergedEnv));
        const encryptedPorts = this.encryptionService.encrypt(JSON.stringify(mergedPorts));

        const message: SocketDeployMessage = {
            type: 'DEPLOY',
            payload: {
                name: templateSlug,
                compose: encryptedCompose,
                env: encryptedEnv,
                ports: encryptedPorts,
                deploymentId,
                schema: { ...schema, normalized },
            },
        };

        // 5. Emit deployment to agents
        this.deploymentGateway.emitDeploy(message);

        return {
            message: 'Deployment initiated',
            template: templateSlug,
            deploymentId,
        };
    }
}