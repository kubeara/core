import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";

import { DeploymentsService } from "./deployments.service";
import { UpdateEnvironmentVariablesDto } from "./dto/update-environment-variables.dto";

@Controller("deployments")
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Get(":deploymentId")
  async getDeployment(@Param("deploymentId") deploymentId: string) {
    const deployment =
      await this.deploymentsService.getDeployment(deploymentId);
    const environment_variables =
      await this.deploymentsService.listEnvironmentVariables(deploymentId, {
        maskSecrets: true,
      });

    return {
      id: deployment.id,
      template_slug: deployment.template_slug,
      status: deployment.status,
      status_message: deployment.status_message,
      last_error: deployment.last_error,
      created_at: deployment.created_at,
      updated_at: deployment.updated_at,
      environment_variables,
    };
  }

  @Get(":deploymentId/env")
  async listEnvironmentVariables(@Param("deploymentId") deploymentId: string) {
    return this.deploymentsService.listEnvironmentVariables(deploymentId, {
      maskSecrets: true,
    });
  }

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
}
