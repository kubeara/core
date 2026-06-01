import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class AppController {
  /**
   * Liveness probe for the control panel API (GET /api/health).
   */
  @Get()
  getHealth(): { status: string; service: string } {
    return {
      status: "ok",
      service: "control-panel-app",
    };
  }
}
