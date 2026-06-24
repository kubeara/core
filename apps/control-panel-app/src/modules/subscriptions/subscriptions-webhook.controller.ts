import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from "@nestjs/common";
import { RawBodyRequest } from "@nestjs/common/interfaces";
import { Request } from "express";
import { SubscriptionService } from "./services/subscription.service";
import { StripeService } from "./services/stripe.service";

@Controller("subscriptions/webhook")
export class SubscriptionsWebhookController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly stripeService: StripeService,
  ) {}

  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ) {
    console.log("signature -> ", signature);
    if (!signature) {
      throw new BadRequestException("Missing stripe-signature header");
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException("Missing raw body");
    }

    const event = this.stripeService.constructWebhookEvent(rawBody, signature);
    await this.subscriptionService.handleWebhookEvent(event);

    return { received: true };
  }
}
