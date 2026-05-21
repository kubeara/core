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

import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";
import { SocketDeployMessage } from "@shared/socket-events";
import { EncryptionService, ServerUrlContext } from "@shared/common";

import { DeployTemplateDto } from "./dto/deploy-template.dto";
import { DeploymentsService, PreparedDeployment } from "./deployments.service";

@Controller("deploy")
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
      serverUrlContext: this.buildServerUrlContext({
        useTraefikRequest: body.useTraefik,
        requestEnv,
        requestPorts,
      }),
    });

    return this.emitPreparedDeployment(prepared, Boolean(deploymentId));
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
      serverUrlContext: this.buildServerUrlContext({
        useTraefikRequest: body.useTraefik,
        requestEnv,
        requestPorts,
      }),
    });

    const result = this.emitPreparedDeployment(prepared, Boolean(deploymentId));

    const publicUrl =
      prepared.mergedEnv.SERVICE_URL_N8N ??
      Object.entries(prepared.mergedEnv).find(([key]) =>
        key.startsWith("SERVICE_URL_"),
      )?.[1];

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

  private emitPreparedDeployment(
    prepared: PreparedDeployment,
    isRedeploy: boolean,
  ): { message: string; template: string; deploymentId: string } {
    this.logger.debug(
      `[emitPreparedDeployment] deploymentId=${prepared.deploymentId} mergedPorts=${JSON.stringify(prepared.mergedPorts)}`,
    );
    const encryptedCompose = this.encryptionService.encrypt(
      prepared.encodedCompose,
    );
    const encryptedEnv = this.encryptionService.encrypt(
      JSON.stringify(prepared.mergedEnv),
    );
    const encryptedPorts = this.encryptionService.encrypt(
      JSON.stringify(prepared.mergedPorts),
    );

    const message: SocketDeployMessage = {
      type: "DEPLOY",
      payload: {
        name: prepared.templateSlug,
        compose: encryptedCompose,
        env: encryptedEnv,
        ports: encryptedPorts,
        deploymentId: prepared.deploymentId,
        schema: prepared.schema,
        composeOnly: prepared.composeOnly,
        useTraefik: prepared.useTraefik,
      },
    };

    this.deploymentGateway.emitDeploy(message);

    return {
      message: isRedeploy ? "Redeployment initiated" : "Deployment initiated",
      template: prepared.templateSlug,
      deploymentId: prepared.deploymentId,
    };
  }

  /**
   * Builds URL generation context for SERVICE_URL_* / SERVICE_FQDN_* and Traefik-oriented resolution.
   *
   * Precedence:
   * - If the client sends `useTraefik`, that value wins.
   * - Else if the client passes any `SERVICE_PORT_*` host binding in `ports` or `env`, Traefik is off
   *   so declared ports are not stripped for that deploy.
   * - Else default from `TRAEFIK_ENABLED` in environment.
   */
  private buildServerUrlContext(options: {
    useTraefikRequest?: boolean;
    requestEnv?: Record<string, unknown>;
    requestPorts?: Record<string, unknown>;
  }): Omit<ServerUrlContext, "deploymentId"> {
    const { useTraefikRequest, requestEnv = {}, requestPorts = {} } = options;

    const publicIp =
      this.deploymentGateway.getPrimaryAgentPublicIp() ??
      process.env.DEFAULT_AGENT_PUBLIC_IP ??
      "127.0.0.1";

    let useTraefik: boolean;
    if (useTraefikRequest !== undefined) {
      useTraefik = Boolean(useTraefikRequest);
    } else if (
      this.requestContainsExplicitServiceHostPorts(requestPorts, requestEnv)
    ) {
      useTraefik = false;
    } else {
      useTraefik = process.env.TRAEFIK_ENABLED === "true";
    }

    return {
      publicIp,
      wildcardDomain: process.env.WILDCARD_DOMAIN ?? null,
      forceHttps: process.env.FORCE_HTTPS === "true",
      useTraefik,
    };
  }

  /**
   * Returns true when the deploy request supplies at least one SERVICE_PORT_* value
   * (host publish intent). Used to avoid Traefik mode stripping those keys.
   */
  private requestContainsExplicitServiceHostPorts(
    requestPorts: Record<string, unknown>,
    requestEnv: Record<string, unknown>,
  ): boolean {
    const hasServicePortValue = (value: unknown): boolean =>
      value !== undefined && value !== null && value !== "";

    for (const [key, value] of Object.entries(requestPorts)) {
      if (key.startsWith("SERVICE_PORT_") && hasServicePortValue(value)) {
        return true;
      }
    }
    for (const [key, value] of Object.entries(requestEnv)) {
      if (key.startsWith("SERVICE_PORT_") && hasServicePortValue(value)) {
        return true;
      }
    }
    return false;
  }
}
