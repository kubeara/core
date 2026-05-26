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
} from "@nestjs/common";

import { resolvePrimaryServicePublicUrl } from "@shared/common";

import { DeployTemplateDto } from "./dto/deploy-template.dto";
import { DeploymentsService } from "./deployments.service";

@Controller("deploy")
export class DeployController {
  private readonly logger = new Logger(DeployController.name);

  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @HttpCode(202)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async deploy(@Body() body: DeployTemplateDto): Promise<{
    message: string;
    template: string;
    deploymentId: string;
  }> {
    const {
      templateSlug,
      env: requestEnv = {},
      ports: requestPorts = {},
      deploymentId,
    } = body;

    this.logger.log(
      deploymentId
        ? `Redeploy '${deploymentId}' for template '${templateSlug}'`
        : `New deployment for template '${templateSlug}'`,
    );
    this.logger.debug(
      `[deploy] payload ports=${JSON.stringify(requestPorts)} envPortKeys=${JSON.stringify(
        Object.keys(requestEnv).filter((key) =>
          key.startsWith("SERVICE_PORT_"),
        ),
      )}`,
    );

    const prepared = await this.deploymentsService.prepareDeployment({
      templateSlug,
      requestEnv,
      requestPorts,
      existingDeploymentId: deploymentId,
      serverUrlContext: this.deploymentsService.buildServerUrlContext({
        useTraefikRequest: body.useTraefik,
        requestEnv,
        requestPorts,
      }),
    });

    return this.deploymentsService.emitPreparedDeployment(
      prepared,
      Boolean(deploymentId),
    );
  }

  /**
   * Coolify-style deploy: compose is the single source of truth for env/ports.
   * Templates do not need template.config.json.
   */
  @Post("compose")
  @HttpCode(202)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async deployCompose(@Body() body: DeployTemplateDto): Promise<{
    message: string;
    template: string;
    deploymentId: string;
    mode: "compose";
    publicUrl?: string;
  }> {
    const {
      templateSlug,
      env: requestEnv = {},
      ports: requestPorts = {},
      deploymentId,
    } = body;

    this.logger.log(
      deploymentId
        ? `Compose redeploy '${deploymentId}' for template '${templateSlug}'`
        : `New compose deployment for template '${templateSlug}'`,
    );
    this.logger.debug(
      `[deploy/compose] payload ports=${JSON.stringify(requestPorts)} envPortKeys=${JSON.stringify(
        Object.keys(requestEnv).filter((key) =>
          key.startsWith("SERVICE_PORT_"),
        ),
      )}`,
    );

    const prepared = await this.deploymentsService.prepareComposeDeployment({
      templateSlug,
      requestEnv,
      requestPorts,
      existingDeploymentId: deploymentId,
      serverUrlContext: this.deploymentsService.buildServerUrlContext({
        useTraefikRequest: body.useTraefik,
        requestEnv,
        requestPorts,
      }),
    });

    const result = this.deploymentsService.emitPreparedDeployment(
      prepared,
      Boolean(deploymentId),
    );

    const publicUrl = resolvePrimaryServicePublicUrl(
      prepared.mergedEnv,
      prepared.templateSlug,
    );

    return { ...result, mode: "compose", publicUrl };
  }

  @Post(":deploymentId/redeploy")
  @HttpCode(202)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async redeploy(
    @Param("deploymentId") deploymentId: string,
    @Body() body: DeployTemplateDto,
  ): Promise<{ message: string; template: string; deploymentId: string }> {
    const deployment =
      await this.deploymentsService.getDeployment(deploymentId);

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
