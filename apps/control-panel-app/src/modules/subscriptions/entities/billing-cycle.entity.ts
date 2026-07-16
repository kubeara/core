import { Column, Entity } from "typeorm";
import { BaseEntity } from "@control-panel/common/entity/base.entity";
import { BillingCycleSlug } from "../enums/billing-cycle.enum";

@Entity({ name: "billingCycles" })
export class BillingCycleEntity extends BaseEntity {
  @Column({ type: "varchar", length: 20, unique: true })
  slug!: BillingCycleSlug;

  @Column({ type: "varchar", length: 50 })
  label!: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  badge!: string | null;

  @Column({ type: "int", default: 0 })
  discountPercent!: number;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;
}
