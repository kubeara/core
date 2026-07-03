import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";
import { AuthenticatedRequest } from "@control-panel/common/interfaces/authenticated-request.interface";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { TerminalService } from "./terminal.service";
import {
  TerminalConnectDto,
  TerminalConnectResponseDto,
  TerminalDisconnectDto,
} from "./dto";

@UseGuards(AccessTokenGuard)
@Controller("servers/:serverId/terminal")
export class TerminalController {
  private readonly logger = new Logger(TerminalController.name);

  constructor(private readonly terminalService: TerminalService) {}

  /**
   * Connects to a terminal session.
   */
  @Post("connect")
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async connect(
    @Req() req: AuthenticatedRequest,
    @Param("serverId") serverId: string,
    @Body() body: TerminalConnectDto,
  ): Promise<ServiceResponse<TerminalConnectResponseDto>> {
    try {
      return await this.terminalService.connectTerminal(
        req.user.id,
        serverId,
        body,
      );
    } catch (error) {
      this.logger.error(
        `Terminal connect failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Disconnects from a terminal session.
   */
  @Post("disconnect")
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async disconnect(
    @Req() req: AuthenticatedRequest,
    @Param("serverId") serverId: string,
    @Body() body: TerminalDisconnectDto,
  ): Promise<ServiceResponse<{ disconnected: true }>> {
    try {
      return await this.terminalService.disconnectTerminal(
        req.user.id,
        serverId,
        body,
      );
    } catch (error) {
      this.logger.error(
        `Terminal disconnect failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
