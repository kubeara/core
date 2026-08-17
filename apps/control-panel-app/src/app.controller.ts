import { Controller, Get, Logger } from "@nestjs/common";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

@Controller("/")
export class AppController {
  private readonly logger = new Logger(AppController.name);

  /**
   * Liveness probe for the control panel API (GET /).
   */
  @Get()
  getHealth(): {
    message: string;
    data: { status: string; service: string };
  } {
    try {
      return {
        message: "Kubeara API is up and running",
        data: {
          status: "ok",
          service: "control-panel-app",
        },
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
