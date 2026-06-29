import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "@control-panel/common/entity/base.entity";
import { OrganizationEntity } from "@control-panel/modules/organizations/entities/organization.entity";
import { PlanEntity } from "./plan.entity";
import { SubscriptionStatus } from "../enums/subscription-status.enum";
import { PendingDowngradeStatus } from "../enums/pending-downgrade-status.enum";
import { BillingCycleSlug } from "../enums/billing-cycle.enum";

@Entity({ name: "subscriptions" })
export class SubscriptionEntity extends BaseEntity {
  @Column({ type: "uuid" })
  organizationId!: string;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: "organizationId" })
  organization!: OrganizationEntity;

  @Column({ type: "uuid" })
  planId!: string;

  @ManyToOne(() => PlanEntity, { eager: true })
  @JoinColumn({ name: "planId" })
  plan!: PlanEntity;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripeCustomerId!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripeSubscriptionId!: string | null;

  @Column({
    type: "varchar",
    length: 50,
    default: SubscriptionStatus.ACTIVE,
  })
  subscriptionStatus!: SubscriptionStatus;

  @Column({ type: "bigint" })
  startedAt!: number;

  @Column({ type: "bigint", nullable: true })
  currentPeriodStart!: number | null;

  @Column({ type: "bigint", nullable: true })
  currentPeriodEnd!: number | null;

  @Column({ type: "bigint", nullable: true })
  canceledAt!: number | null;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  billingAmount!: number;

  @Column({
    type: "varchar",
    length: 20,
    default: BillingCycleSlug.MONTHLY,
  })
  billingCycle!: BillingCycleSlug;

  @Column({ type: "uuid", nullable: true })
  pendingPlanId!: string | null;

  @ManyToOne(() => PlanEntity, { eager: true, nullable: true })
  @JoinColumn({ name: "pendingPlanId" })
  pendingPlan!: PlanEntity | null;

  @Column({ type: "bigint", nullable: true })
  pendingEffectiveAt!: number | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  pendingDowngradeStatus!: PendingDowngradeStatus | null;

  @Column({ type: "text", nullable: true })
  cancellationReason!: string | null;
}
