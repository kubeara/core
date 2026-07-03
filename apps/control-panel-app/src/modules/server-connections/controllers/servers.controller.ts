import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { ServerConnectionsService } from "../services/server-connections.service";
import { LocalServerService } from "../services/local-server.service";
import {
  CreateServerOnboardRequestDto,
  DeleteServerRequestDto,
  DeleteServerResponseDto,
  ListServersQueryDto,
  OnboardSuccessData,
  ServerResponseDto,
  ServerResourcesResponseDto,
  UpdateServerDto,
} from "../dto";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { PaginatedResponse } from "@shared/common";
import { AuthenticatedRequest } from "../../../common/interfaces/authenticated-request.interface";
import { ERROR_MESSAGES } from "@control-panel/constants/error";

@UseGuards(AccessTokenGuard)
@Controller("servers")
export class ServersController {
  private readonly logger = new Logger(ServersController.name);

  constructor(
    private readonly connectionsService: ServerConnectionsService,
    private readonly localServerService: LocalServerService,
  ) {}

  /**
   * Returns the current user's local machine server when it already exists.
   */
  @Get("local")
  async getLocalServer(@Req() req: { user: UserEntity }) {
    try {
      const server = await this.localServerService.findLocalServer(req.user.id);

      if (!server) {
        throw new NotFoundException(
          ERROR_MESSAGES.SERVER.LOCAL_SERVER_NOT_FOUND,
        );
      }

      return {
        serverId: server.id,
        name: server.name,
        host: server.host,
        serverType: server.serverType,
      };
    } catch (error) {
      this.logger.error(`Get local server failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * List servers for the authenticated user.
   */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListServersQueryDto,
  ): Promise<ServiceResponse<PaginatedResponse<ServerResponseDto>>> {
    try {
      return await this.connectionsService.listServers(req.user.id, query);
    } catch (error) {
      this.logger.error(`List servers failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Fetches on-demand server resource metrics from the connected agent.
   */
  @Get(":serverId/resources")
  async getServerResources(
    @Req() req: AuthenticatedRequest,
    @Param("serverId") serverId: string,
  ): Promise<ServerResourcesResponseDto> {
    try {
      return await this.connectionsService.getServerResources(
        req.user.id,
        serverId,
      );
    } catch (error) {
      this.logger.error(
        `Get server resources failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get a single server by ID.
   */
  @Get(":id")
  async getOne(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<ServiceResponse<ServerResponseDto>> {
    try {
      return await this.connectionsService.getServerById(req.user.id, id);
    } catch (error) {
      this.logger.error(`Get server failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Create and onboard a server.
   */
  @Post("onboard")
  @HttpCode(HttpStatus.CREATED)
  async onboard(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateServerOnboardRequestDto,
  ): Promise<ServiceResponse<OnboardSuccessData>> {
    try {
      return await this.connectionsService.onboardServer(req.user.id, body);
    } catch (error) {
      this.logger.error(`Onboard server failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Update server name.
   */
  @Patch(":id")
  async update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: UpdateServerDto,
  ): Promise<ServiceResponse<ServerResponseDto>> {
    try {
      return await this.connectionsService.updateServer(req.user.id, id, body);
    } catch (error) {
      this.logger.error(`Update server failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Connect with the server.
   */
  @Post(":id/connect")
  @HttpCode(HttpStatus.OK)
  async connect(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<ServiceResponse<{ connected: boolean }>> {
    try {
      return await this.connectionsService.connectServer(req.user.id, id);
    } catch (error) {
      this.logger.error(`Connect server failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Disconnect server.
   */
  @Post(":id/disconnect")
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<ServiceResponse<{ connected: boolean }>> {
    try {
      return await this.connectionsService.disconnectServer(req.user.id, id);
    } catch (error) {
      this.logger.error(`Disconnect server failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Soft delete server.
   */
  @Post(":id/delete")
  @HttpCode(HttpStatus.OK)
  async deleteServer(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: DeleteServerRequestDto,
  ): Promise<ServiceResponse<DeleteServerResponseDto>> {
    try {
      return await this.connectionsService.deleteServer(req.user.id, id, {
        removeManagedServices: body.removeManagedServices === true,
      });
    } catch (error) {
      this.logger.error(`Delete server failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
