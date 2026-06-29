import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { BillingCycleSlug } from "../enums/billing-cycle.enum";
import { PlanSlug } from "../enums/plan-slug.enum";

export class ChangePlanDto {
  @IsEnum(PlanSlug)
  planSlug!: PlanSlug;
}

export class CheckoutDto {
  @IsEnum(PlanSlug)
  planSlug!: PlanSlug;

  @IsOptional()
  @IsBoolean()
  startPayment?: boolean;

  @IsOptional()
  @IsEnum(BillingCycleSlug)
  billingCycle?: BillingCycleSlug;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsOptional()
  @IsBoolean()
  removePromo?: boolean;
}

export class CancelSubscriptionDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
