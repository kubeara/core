import {
  Controller,
  Get,
  Header,
  Logger,
  Query,
  UseGuards,
} from "@nestjs/common";

import { KubearaPublicOriginGuard } from "@control-panel/common/guards/kubeara-public-origin.guard";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { SubscriptionService } from "@control-panel/modules/subscriptions/services/subscription.service";

@UseGuards(KubearaPublicOriginGuard)
@Controller("public/plans")
export class PlansController {
  private readonly logger = new Logger(PlansController.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * Marketing-safe plans catalog for the public landing page.
   */
  @Get()
  @Header("Cache-Control", "public, max-age=300")
  async listPlans(@Query("locale") locale?: string) {
    try {
      return await this.subscriptionService.listPlans(locale);
    } catch (error) {
      this.logger.error(`List public plans failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
