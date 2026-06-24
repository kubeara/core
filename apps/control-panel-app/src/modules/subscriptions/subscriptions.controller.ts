import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";
import { AuthenticatedRequest } from "@control-panel/common/interfaces/authenticated-request.interface";
import { SubscriptionService } from "./services/subscription.service";
import { ChangePlanDto, CheckoutDto } from "./dto/subscription.dto";

@UseGuards(AccessTokenGuard)
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get("plans")
  listPlans() {
    return this.subscriptionService.listPlans();
  }

  @Get("current")
  getCurrent(@Req() req: AuthenticatedRequest) {
    return this.subscriptionService.getOrganizationSubscription(
      req.user.organizationId,
    );
  }

  @Post("checkout")
  checkout(@Req() req: AuthenticatedRequest, @Body() body: CheckoutDto) {
    return this.subscriptionService.createCheckoutSession(
      req.user.organizationId,
      body.planSlug,
      req.user.email,
      req.user.name,
      body.startPayment === true,
    );
  }

  @Post("change-plan")
  changePlan(@Req() req: AuthenticatedRequest, @Body() body: ChangePlanDto) {
    return this.subscriptionService.changePlan(
      req.user.organizationId,
      body.planSlug,
    );
  }

  @Post("confirm")
  confirm(@Req() req: AuthenticatedRequest, @Body() body: CheckoutDto) {
    return this.subscriptionService.confirmCheckout(
      req.user.organizationId,
      body.planSlug,
    );
  }

  @Post("cancel-pending-downgrade")
  cancelPendingDowngrade(@Req() req: AuthenticatedRequest) {
    return this.subscriptionService.cancelPendingDowngrade(
      req.user.organizationId,
    );
  }

  @Post("cancel")
  cancel(@Req() req: AuthenticatedRequest) {
    return this.subscriptionService.cancelSubscription(req.user.organizationId);
  }
}
