import {
  Controller,
  Post,
  Body,
  HttpCode,
  Logger,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from "@nestjs/common";

import { TemplatesService } from "../../templates/services/templates.service";
import { DeploymentGateway } from "../../../websocket/websocket.gateway";
import { SocketDeployMessage } from "@shared/socket-events";
import { EncryptionService, TemplateConfigService } from "@shared/common";
import { DeployTemplateDto } from "../dto/deploy-template.dto";
import { TemplateSchema, SchemaFieldDetails } from "@shared/socket-events";
@Controller("deploy")
export class DeployController {
  private readonly logger = new Logger(DeployController.name);

  constructor(
    private readonly templatesService: TemplatesService,
    private readonly deploymentGateway: DeploymentGateway,
    private readonly encryptionService: EncryptionService,
    private readonly templateConfigService: TemplateConfigService,
  ) {}

  @Post()
  @HttpCode(202)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async deploy(@Body() body: DeployTemplateDto): Promise<{
    message: string;
    template: string;
    deploymentId: string;
    serverId: string;
  }> {
    const {
      templateSlug,
      env: requestEnv = {},
      ports: requestPorts = {},
    } = body;

    this.logger.log(`Received deployment request for '${templateSlug}'`);

    const tplEntity =
      await this.templatesService.getTemplateEntity(templateSlug);
    const encodedCompose = tplEntity.compose;

    if (!encodedCompose) {
      throw new BadRequestException("Template has no compose content");
    }

    const schema: TemplateSchema = {
      env_schema: tplEntity.env_schema as Record<string, SchemaFieldDetails>,
      port_schema: tplEntity.port_schema as Record<string, SchemaFieldDetails>,
    };

    const normalized = this.templateConfigService.normalizeSchema(schema);
    const { env: mergedEnv, ports: mergedPorts } =
      this.templateConfigService.mergeAndValidate(
        { ...schema, normalized },
        { env: requestEnv, ports: requestPorts },
      );

    const deploymentId = `deployment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const encryptedCompose = this.encryptionService.encrypt(encodedCompose);
    const encryptedEnv = this.encryptionService.encrypt(
      JSON.stringify(mergedEnv),
    );
    const encryptedPorts = this.encryptionService.encrypt(
      JSON.stringify(mergedPorts),
    );

    const message: SocketDeployMessage = {
      type: "DEPLOY",
      payload: {
        name: templateSlug,
        compose: encryptedCompose,
        env: encryptedEnv,
        ports: encryptedPorts,
        deploymentId,
        schema: { ...schema, normalized },
      },
    };

    try {
      if (!body.serverId) {
        throw new BadRequestException(
          "serverId is required. Use POST /deploy/compose with deployOnLocal for local deploy.",
        );
      }

      this.deploymentGateway.emitDeploy(message, body.serverId);

      return {
        message: "Deployment initiated",
        template: templateSlug,
        deploymentId,
        serverId: body.serverId,
      };
    } catch (error) {
      this.logger.error(
        `Legacy deploy emit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
