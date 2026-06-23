import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PlanEntity } from "./entities/plan.entity";
import { SubscriptionEntity } from "./entities/subscription.entity";
import { SubscriptionService } from "./services/subscription.service";
import { StripeService } from "./services/stripe.service";
import { SubscriptionNotificationService } from "./services/subscription-notification.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsWebhookController } from "./subscriptions-webhook.controller";

@Module({
  imports: [TypeOrmModule.forFeature([PlanEntity, SubscriptionEntity])],
  controllers: [SubscriptionsController, SubscriptionsWebhookController],
  providers: [
    SubscriptionService,
    StripeService,
    SubscriptionNotificationService,
  ],
  exports: [SubscriptionService],
})
export class SubscriptionsModule {}
