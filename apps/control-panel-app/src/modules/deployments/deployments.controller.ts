import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";

import {
  normalizeDeployRequestVariables,
  resolvePrimaryServicePublicUrl,
} from "@shared/common";

import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";

import { DeployTemplateDto } from "./dto/deploy-template.dto";
import { ContainerLogsStopDto } from "./dto/container-logs.dto";
import { DeploymentsService } from "./deployments.service";
import { UpdateEnvironmentVariablesDto } from "./dto/update-environment-variables.dto";

@Controller("deployments")
@UseGuards(AccessTokenGuard)
export class DeploymentsController {
  private readonly logger = new Logger(DeploymentsController.name);

  constructor(private readonly deploymentsService: DeploymentsService) {}

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
        env: rawEnv = {},
        ports: rawPorts = {},
        deploymentId,
      } = body;

      const { env: requestEnv, ports: requestPorts } =
        normalizeDeployRequestVariables(rawEnv, rawPorts);

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

      const result = this.deploymentsService.schedulePreparedDeployment(
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

  /**
   * Deploy a template
   */
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
        env: rawEnv = {},
        ports: rawPorts = {},
        deploymentId,
      } = body;

      const { env: requestEnv, ports: requestPorts } =
        normalizeDeployRequestVariables(rawEnv, rawPorts);

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

      return this.deploymentsService.schedulePreparedDeployment(
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
   * Redeploy a deployment
   */
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

      if (body.templateSlug && body.templateSlug !== deployment.templateSlug) {
        throw new BadRequestException(
          `Template slug mismatch: deployment uses '${deployment.templateSlug}'`,
        );
      }

      return this.deploy(req, {
        ...body,
        templateSlug: deployment.templateSlug,
        deploymentId,
        serverId: body.serverId ?? deployment.serverId ?? undefined,
        deployOnLocal:
          body.deployOnLocal ?? (!body.serverId && !deployment.serverId),
      });
    } catch (error) {
      this.logger.error(
        `Redeploy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * List containers for a server
   */
  @Get(":serverId/containers")
  async listServerContainers(
    @Req() req: { user: UserEntity },
    @Param("serverId") serverId: string,
  ) {
    const containers = await this.deploymentsService.listServerContainers(
      serverId,
      req.user.id,
    );
    return { containers };
  }

  /**
   * Stop a container on a server (agent-first, host fallback).
   */
  @Post(":serverId/containers/:containerId/stop")
  @HttpCode(200)
  async stopContainer(
    @Req() req: { user: UserEntity },
    @Param("serverId") serverId: string,
    @Param("containerId") containerId: string,
  ) {
    return this.deploymentsService.executeContainerAction(
      serverId,
      req.user.id,
      containerId,
      "stop",
    );
  }

  /**
   * Restart a container on a server (agent-first, host fallback).
   */
  @Post(":serverId/containers/:containerId/restart")
  @HttpCode(200)
  async restartContainer(
    @Req() req: { user: UserEntity },
    @Param("serverId") serverId: string,
    @Param("containerId") containerId: string,
  ) {
    return this.deploymentsService.executeContainerAction(
      serverId,
      req.user.id,
      containerId,
      "restart",
    );
  }

  /**
   * Delete a container on a server (agent-first, host fallback).
   */
  @Delete(":serverId/containers/:containerId")
  @HttpCode(200)
  async deleteContainer(
    @Req() req: { user: UserEntity },
    @Param("serverId") serverId: string,
    @Param("containerId") containerId: string,
  ) {
    return this.deploymentsService.executeContainerAction(
      serverId,
      req.user.id,
      containerId,
      "delete",
    );
  }

  /**
   * Start streaming logs for a container via the connected agent.
   */
  @Post(":serverId/containers/:containerId/logs/start")
  @HttpCode(200)
  async startContainerLogs(
    @Req() req: { user: UserEntity },
    @Param("serverId") serverId: string,
    @Param("containerId") containerId: string,
  ) {
    const data = await this.deploymentsService.startContainerLogs(
      serverId,
      req.user.id,
      containerId,
    );
    return { message: "Container log stream started", data };
  }

  /**
   * Stop an active container log stream.
   */
  @Post(":serverId/containers/logs/stop")
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async stopContainerLogs(
    @Req() req: { user: UserEntity },
    @Param("serverId") serverId: string,
    @Body() body: ContainerLogsStopDto,
  ) {
    return this.deploymentsService.stopContainerLogs(
      serverId,
      req.user.id,
      body.sessionId,
    );
  }

  /**
   * List environment variables for a deployment
   */
  @Get(":deploymentId/env")
  async listEnvironmentVariables(@Param("deploymentId") deploymentId: string) {
    return this.deploymentsService.listEnvironmentVariables(deploymentId, {
      maskSecrets: true,
    });
  }

  /**
   * Get a deployment
   */
  @Get(":deploymentId")
  async getDeployment(@Param("deploymentId") deploymentId: string) {
    const deployment =
      await this.deploymentsService.getDeployment(deploymentId);
    const environmentVariables =
      await this.deploymentsService.listEnvironmentVariables(deploymentId, {
        maskSecrets: true,
      });

    return {
      id: deployment.id,
      templateSlug: deployment.templateSlug,
      serverId: deployment.serverId,
      userId: deployment.userId,
      status: deployment.status,
      deploymentStatus: deployment.deploymentStatus,
      statusMessage: deployment.statusMessage,
      lastError: deployment.lastError,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      environmentVariables,
    };
  }

  /**
   * Update environment variables for a deployment
   */
  @Patch(":deploymentId/env")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateEnvironmentVariables(
    @Param("deploymentId") deploymentId: string,
    @Body() body: UpdateEnvironmentVariablesDto,
  ) {
    return this.deploymentsService.updateEnvironmentVariables(deploymentId, {
      env: body.env,
      ports: body.ports,
    });
  }

  /**
   * Removes a deployment and its Docker resources on the connected agent.
   * The DB record is soft-deleted once the agent confirms teardown.
   */
  @Delete(":deploymentId")
  async removeDeployment(@Param("deploymentId") deploymentId: string) {
    return this.deploymentsService.removeDeployment(deploymentId);
  }
}
