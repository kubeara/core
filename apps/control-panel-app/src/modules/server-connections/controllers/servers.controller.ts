import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ServerConnectionsService } from "../services/server-connections.service";
import { LocalServerService } from "../services/local-server.service";
import {
  CreateServerOnboardRequestDto,
  ListServersQueryDto,
  OnboardSuccessData,
  ServerResponseDto,
  UpdateServerDto,
} from "../dto";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { JwtAuthGuard } from "@control-panel/modules/auth/guards/jwt-auth.guard";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { PaginatedResponse } from "@shared/common";
import { AuthenticatedRequest } from "../../../common/interfaces/authenticated-request.interface";
import { ERROR_MESSAGES } from "@control-panel/constants/error";

@UseGuards(JwtAuthGuard)
@Controller("servers")
export class ServersController {
  constructor(
    private readonly connectionsService: ServerConnectionsService,
    private readonly localServerService: LocalServerService,
  ) {}

  /**
   * Returns the current user's local machine server when it already exists.
   * Create it via deploy with `deployOnLocal: true` (POST /deployments/compose).
   */
  @Get("local")
  async getLocalServer(@Req() req: { user: UserEntity }) {
    const server = await this.localServerService.findLocalServer(req.user.id);

    if (!server) {
      throw new NotFoundException(ERROR_MESSAGES.SERVER.LOCAL_SERVER_NOT_FOUND);
    }

    return {
      serverId: server.id,
      name: server.name,
      host: server.host,
      serverType: server.serverType,
    };
  }

  /**
   * List servers for the authenticated user.
   */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListServersQueryDto,
  ): Promise<ServiceResponse<PaginatedResponse<ServerResponseDto>>> {
    return await this.connectionsService.listServers(req.user.id, query);
  }

  /**
   * Get a single server by ID.
   */
  @Get(":id")
  async getOne(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<ServiceResponse<ServerResponseDto>> {
    return await this.connectionsService.getServerById(req.user.id, id);
  }

  /**
   * Create and onboard a server.
   */
  @Post("onboard")
  @HttpCode(HttpStatus.CREATED)
  onboard(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateServerOnboardRequestDto,
  ): Promise<ServiceResponse<OnboardSuccessData>> {
    return this.connectionsService.onboardServer(req.user.id, body);
  }

  /**
   * Update server name.
   */
  @Patch(":id")
  update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: UpdateServerDto,
  ): Promise<ServiceResponse<ServerResponseDto>> {
    return this.connectionsService.updateServer(req.user.id, id, body);
  }

  /**
   * Connect with the server.
   */
  @Post(":id/connect")
  @HttpCode(HttpStatus.OK)
  connect(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<ServiceResponse<{ connected: boolean }>> {
    return this.connectionsService.connectServer(req.user.id, id);
  }

  /**
   * Disconnect server.
   */
  @Post(":id/disconnect")
  @HttpCode(HttpStatus.OK)
  disconnect(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<ServiceResponse<{ connected: boolean }>> {
    return this.connectionsService.disconnectServer(req.user.id, id);
  }

  /**
   * Soft delete server.
   */
  @Post(":id/delete")
  @HttpCode(HttpStatus.OK)
  deleteServer(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<ServiceResponse<{ deleted: true }>> {
    return this.connectionsService.deleteServer(req.user.id, id);
  }
}
