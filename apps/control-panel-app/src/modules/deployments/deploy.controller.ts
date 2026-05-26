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
  Req,
  UseGuards,
} from "@nestjs/common";

import { resolvePrimaryServicePublicUrl } from "@shared/common";

import { JwtAuthGuard } from "@control-panel/modules/auth/guards/jwt-auth.guard";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

import { DeployTemplateDto } from "./dto/deploy-template.dto";
import { DeploymentsService } from "./deployments.service";

@Controller("deploy")
@UseGuards(JwtAuthGuard)
export class DeployController {
  private readonly logger = new Logger(DeployController.name);

  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @HttpCode(202)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async deploy(
    @Req() req: { user: UserEntity },
    @Body() body: DeployTemplateDto,
  ): Promise<{
    message: string;
    template: string;
    deploymentId: string;
    serverId: string;
  }> {
    try {
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

      const { serverId, userId } =
        await this.deploymentsService.resolveDeploymentTarget({
          userId: req.user.id,
          serverId: body.serverId,
          deployOnLocal: body.deployOnLocal,
          existingDeploymentId: deploymentId,
        });

      const serverUrlContext =
        await this.deploymentsService.buildServerUrlContext({
          userId: req.user.id,
          serverId,
          useTraefikRequest: body.useTraefik,
          requestEnv,
          requestPorts,
        });

      const prepared = await this.deploymentsService.prepareDeployment({
        templateSlug,
        serverId,
        userId,
        requestEnv,
        requestPorts,
        existingDeploymentId: deploymentId,
        serverUrlContext,
      });

      return this.deploymentsService.emitPreparedDeployment(
        prepared,
        Boolean(deploymentId),
      );
    } catch (error) {
      this.logger.error(
        `Deploy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Coolify-style deploy: compose is the single source of truth for env/ports.
   * Templates do not need template.config.json.
   */
  @Post("compose")
  @HttpCode(202)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async deployCompose(
    @Req() req: { user: UserEntity },
    @Body() body: DeployTemplateDto,
  ): Promise<{
    message: string;
    template: string;
    deploymentId: string;
    serverId: string;
    mode: "compose";
    publicUrl?: string;
  }> {
    try {
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

      const { serverId, userId } =
        await this.deploymentsService.resolveDeploymentTarget({
          userId: req.user.id,
          serverId: body.serverId,
          deployOnLocal: body.deployOnLocal,
          existingDeploymentId: deploymentId,
        });

      const serverUrlContext =
        await this.deploymentsService.buildServerUrlContext({
          userId: req.user.id,
          serverId,
          useTraefikRequest: body.useTraefik,
          requestEnv,
          requestPorts,
        });

      const prepared = await this.deploymentsService.prepareComposeDeployment({
        templateSlug,
        serverId,
        userId,
        requestEnv,
        requestPorts,
        existingDeploymentId: deploymentId,
        serverUrlContext,
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
    } catch (error) {
      this.logger.error(
        `Compose deploy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @Post(":deploymentId/redeploy")
  @HttpCode(202)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async redeploy(
    @Req() req: { user: UserEntity },
    @Param("deploymentId") deploymentId: string,
    @Body() body: DeployTemplateDto,
  ): Promise<{
    message: string;
    template: string;
    deploymentId: string;
    serverId: string;
  }> {
    try {
      const deployment =
        await this.deploymentsService.getDeployment(deploymentId);

      if (body.templateSlug && body.templateSlug !== deployment.template_slug) {
        throw new BadRequestException(
          `Template slug mismatch: deployment uses '${deployment.template_slug}'`,
        );
      }

      return this.deploy(req, {
        ...body,
        templateSlug: deployment.template_slug,
        deploymentId,
        serverId: body.serverId ?? deployment.server_id ?? undefined,
        deployOnLocal:
          body.deployOnLocal ?? (!body.serverId && !deployment.server_id),
      });
    } catch (error) {
      this.logger.error(
        `Redeploy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
