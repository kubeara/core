import {
    Controller,
    Post,
    Body,
    Param,
    HttpCode,
    Logger,
    UsePipes,
    ValidationPipe,
    BadRequestException,
} from '@nestjs/common';

import { DeploymentGateway } from '../websocket/websocket.gateway';
import { SocketDeployMessage } from '@shared/socket-events';
import { EncryptionService } from '@shared/common';

import { DeployTemplateDto } from './dto/deploy-template.dto';
import { DeploymentsService } from './deployments.service';

@Controller('deploy')
export class DeployController {
    private readonly logger = new Logger(DeployController.name);

    constructor(
        private readonly deploymentsService: DeploymentsService,
        private readonly deploymentGateway: DeploymentGateway,
        private readonly encryptionService: EncryptionService,
    ) {}

    @Post()
    @HttpCode(202)
    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    async deploy(@Body() body: DeployTemplateDto): Promise<{
        message: string;
        template: string;
        deploymentId: string;
    }> {
        const { templateSlug, env: requestEnv = {}, ports: requestPorts = {}, deploymentId } = body;

        this.logger.log(
            deploymentId
                ? `Redeploy '${deploymentId}' for template '${templateSlug}'`
                : `New deployment for template '${templateSlug}'`,
        );

        const prepared = await this.deploymentsService.prepareDeployment({
            templateSlug,
            requestEnv,
            requestPorts,
            existingDeploymentId: deploymentId,
        });

        const encryptedCompose = this.encryptionService.encrypt(prepared.encodedCompose);
        const encryptedEnv = this.encryptionService.encrypt(JSON.stringify(prepared.mergedEnv));
        const encryptedPorts = this.encryptionService.encrypt(JSON.stringify(prepared.mergedPorts));

        const message: SocketDeployMessage = {
            type: 'DEPLOY',
            payload: {
                name: prepared.templateSlug,
                compose: encryptedCompose,
                env: encryptedEnv,
                ports: encryptedPorts,
                deploymentId: prepared.deploymentId,
                schema: prepared.schema,
            },
        };

        this.deploymentGateway.emitDeploy(message);

        return {
            message: deploymentId ? 'Redeployment initiated' : 'Deployment initiated',
            template: prepared.templateSlug,
            deploymentId: prepared.deploymentId,
        };
    }

    @Post(':deploymentId/redeploy')
    @HttpCode(202)
    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    async redeploy(
        @Param('deploymentId') deploymentId: string,
        @Body() body: DeployTemplateDto,
    ): Promise<{ message: string; template: string; deploymentId: string }> {
        const deployment = await this.deploymentsService.getDeployment(deploymentId);

        if (body.templateSlug && body.templateSlug !== deployment.template_slug) {
            throw new BadRequestException(
                `Template slug mismatch: deployment uses '${deployment.template_slug}'`,
            );
        }

        return this.deploy({
            ...body,
            templateSlug: deployment.template_slug,
            deploymentId,
        });
    }
}
