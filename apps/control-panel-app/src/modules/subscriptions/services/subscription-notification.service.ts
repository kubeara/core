import { Injectable, Logger } from "@nestjs/common";
import { logStructured } from "@shared/common";

@Injectable()
export class SubscriptionNotificationService {
  private readonly logger = new Logger(SubscriptionNotificationService.name);

  notifySubscriptionRenewed(payload: {
    organizationId: string;
    planName: string;
    renewalDate: number | null;
  }): void {
    this.logger.log(
      `[notification:placeholder] Subscription renewed for org ${payload.organizationId} (${payload.planName})`,
    );
  }

  notifySubscriptionCanceled(payload: {
    organizationId: string;
    planName: string;
  }): void {
    this.logger.log(
      `[notification:placeholder] Subscription canceled for org ${payload.organizationId} (${payload.planName})`,
    );
  }

  notifyPaymentFailed(payload: {
    organizationId: string;
    planName: string;
  }): void {
    this.logger.log(
      `[notification:placeholder] Payment failed for org ${payload.organizationId} (${payload.planName})`,
    );
  }

  notifyPlanChanged(payload: {
    organizationId: string;
    previousPlan: string;
    newPlan: string;
  }): void {
    logStructured(
      this.logger,
      "log",
      "subscription.plan_changed",
      "succeeded",
      {
        module: "SubscriptionNotificationService",
        organizationId: payload.organizationId,
        previousPlan: payload.previousPlan,
        newPlan: payload.newPlan,
      },
    );
  }
}
