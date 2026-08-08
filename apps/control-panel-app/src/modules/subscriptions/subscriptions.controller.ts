import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";
import { AuthenticatedRequest } from "@control-panel/common/interfaces/authenticated-request.interface";
import { SubscriptionService } from "./services/subscription.service";
import {
  CancelSubscriptionDto,
  ChangePlanDto,
  CheckoutDto,
} from "./dto/subscription.dto";

@UseGuards(AccessTokenGuard)
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get("plans")
  listPlans(@Query("locale") locale?: string) {
    return this.subscriptionService.listPlans(locale);
  }

  @Get("current")
  getCurrent(
    @Req() req: AuthenticatedRequest,
    @Query("locale") locale?: string,
  ) {
    return this.subscriptionService.getOrganizationSubscription(
      req.user.organizationId,
      locale,
    );
  }

  @Get("invoices")
  listInvoices(@Req() req: AuthenticatedRequest) {
    return this.subscriptionService.listOrganizationInvoices(
      req.user.organizationId,
      req.user.name,
      req.user.email,
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
      body.billingCycle,
      body.promoCode,
      body.removePromo === true,
    );
  }

  @Post("change-plan")
  changePlan(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChangePlanDto,
    @Query("locale") locale?: string,
  ) {
    return this.subscriptionService.changePlan(
      req.user.organizationId,
      body.planSlug,
      locale,
    );
  }

  @Post("confirm")
  confirm(
    @Req() req: AuthenticatedRequest,
    @Body() body: CheckoutDto,
    @Query("locale") locale?: string,
  ) {
    return this.subscriptionService.confirmCheckout(
      req.user.organizationId,
      body.planSlug,
      body.billingCycle,
      locale,
    );
  }

  @Post("cancel-pending-downgrade")
  cancelPendingDowngrade(
    @Req() req: AuthenticatedRequest,
    @Query("locale") locale?: string,
  ) {
    return this.subscriptionService.cancelPendingDowngrade(
      req.user.organizationId,
      locale,
    );
  }

  @Post("cancel")
  cancel(
    @Req() req: AuthenticatedRequest,
    @Body() body: CancelSubscriptionDto,
    @Query("locale") locale?: string,
  ) {
    return this.subscriptionService.cancelSubscription(
      req.user.organizationId,
      body.reason,
      locale,
    );
  }
}
