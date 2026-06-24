import { IsBoolean, IsEnum, IsOptional } from "class-validator";
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
}
