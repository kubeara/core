import { Controller, Get, Logger } from "@nestjs/common";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

@Controller("health")
export class AppController {
  private readonly logger = new Logger(AppController.name);

  /**
   * Liveness probe for the control panel API (GET /api/health).
   */
  @Get()
  getHealth(): { status: string; service: string } {
    try {
      return {
        status: "ok",
        service: "control-panel-app",
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
